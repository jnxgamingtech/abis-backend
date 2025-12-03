const express = require('express');
const router = express.Router();
const adminKeyMiddleware = require('../middleware/adminKey');
const Document = require('../models/Document');
const Blotter = require('../models/Blotter');
const PDFDocument = require('pdfkit');

// simple CSV builder
function toCSV(rows, fields) {
  const header = fields.join(',') + '\n';
  const lines = rows.map(r => fields.map(f => {
    let v = r[f] === undefined || r[f] === null ? '' : String(r[f]);
    // escape quotes
    if (v.includes(',') || v.includes('\"') || v.includes('\n')) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }).join(','));
  return header + lines.join('\n');
}

// documents CSV
router.get('/documents/csv', adminKeyMiddleware, async (req, res) => {
  try {
    const docs = await Document.find().sort({ createdAt: -1 }).limit(10000);
    const mapped = docs.map(d => ({
      trackingNumber: d.trackingNumber,
      requestDate: d.createdAt ? d.createdAt.toISOString() : '',
      residentName: d.residentName || (d.formData && (d.formData.fullName || d.formData.name)) || '',
      documentType: d.docType,
      status: d.status,
      pickupCode: d.pickupCode || '',
      remarks: d.remarks || '',
    }));
    const csv = toCSV(mapped, ['trackingNumber','requestDate','residentName','documentType','status','pickupCode','remarks']);
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="documents-report.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// blotter CSV
router.get('/blotter/csv', adminKeyMiddleware, async (req, res) => {
  try {
    const list = await Blotter.find().sort({ createdAt: -1 }).limit(10000);
    const mapped = list.map(b => ({
      id: b._id,
      title: b.title,
      description: (b.description || '').replace(/\n/g, ' '),
      reporterName: b.reporterName || '',
      incidentDate: b.incidentDate ? b.incidentDate.toISOString() : '',
      status: b.status,
    }));
    const csv = toCSV(mapped, ['id','title','description','reporterName','incidentDate','status']);
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="blotter-report.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// generate a simple PDF document template for a document id
router.get('/document/:id/pdf', adminKeyMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const pdf = new PDFDocument({ size: 'LETTER', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.trackingNumber || 'document'}.pdf"`);
    pdf.pipe(res);

    // Simple Barangay header
    pdf.fontSize(14).text('REPUBLIC OF THE PHILIPPINES', { align: 'center' });
    pdf.moveDown(0.2);
    pdf.fontSize(16).text('BARANGAY CLEARANCE', { align: 'center', underline: true });
    pdf.moveDown(1);

    pdf.fontSize(12).text(`Tracking #: ${doc.trackingNumber || ''}`);
    pdf.moveDown(0.5);
    pdf.text(`Requested by: ${doc.residentName || ''}`);
    pdf.moveDown(0.5);
    pdf.text(`Document Type: ${doc.docType || ''}`);
    pdf.moveDown(0.5);
    pdf.text(`Purpose: ${doc.formData?.purpose || ''}`);
    pdf.moveDown(1);

    pdf.text('This is to certify that the above-named person has requested the document listed.');
    pdf.moveDown(2);
    pdf.text('Issued by:', { continued: true }).moveDown(3);
    pdf.text('___________________________');
    pdf.text('Barangay Captain / Authorized Official');

    pdf.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
