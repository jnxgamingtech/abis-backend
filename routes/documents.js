const express = require('express');
const router = express.Router();
const Document = require('../models/Document');
const { nanoid } = require('nanoid');
const { sendEmail, sendSMS } = require('../utils/notify');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads/certificates directory exists
const certificatesUploadDir = path.join(__dirname, '../uploads/certificates');
if (!fs.existsSync(certificatesUploadDir)) {
  fs.mkdirSync(certificatesUploadDir, { recursive: true });
}

// Configure multer for certificate PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, certificatesUploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, 'cert-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    // Allow PDF and image files
    const allowedTypes = /pdf|jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /pdf|image/.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
  }
});

// map DB doc -> API shape (backwards-compatible with frontend expectations)
function mapDoc(doc) {
  return {
    id: doc._id,
    trackingNumber: doc.trackingNumber,
    requestDate: doc.createdAt,
    residentName: doc.residentName || (doc.formData && (doc.formData.fullName || doc.formData.name)) || '',
    documentType: doc.docType,
    status: doc.status,
    pickupCode: doc.pickupCode,
    appointmentDatetime: doc.appointmentDatetime || doc.appointment_datetime || (doc.formData && (doc.formData.appointmentDatetime || doc.formData.appointment_datetime)) || null,
    remarks: doc.remarks,
    formFields: doc.formData,
    issuedAt: doc.issuedAt,
    paymentMethod: doc.paymentMethod,
    paymentStatus: doc.paymentStatus,
    paymentProofUrl: doc.paymentProofUrl,
    certificateUrl: doc.certificateUrl,
    certificateFileName: doc.certificateFileName,
    certificationCount: doc.certificationCount,
    crimeRecordStatus: doc.crimeRecordStatus,
  };
}

// list documents
router.get('/', async (req, res) => {
  try {
    const docs = await Document.find().sort({ createdAt: -1 }).limit(1000);
    res.json(docs.map(mapDoc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// create document
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const trackingNumber = data.trackingNumber || `ABIS-${Date.now()}-${nanoid(6)}`;
    const pickupCode = data.pickupCode || nanoid(6).toUpperCase();

    // Merge all form fields including contact info, purpose, pickup status, etc into formData
    const formData = {
      ...data.formFields,
      phone: data.phone || data.contactPhone || '',
      phone2: data.phone2 || '',
      email: data.email || data.contactEmail || '',
      purpose: data.purpose || '',
      pickup: data.pickup || false,
    };

    const doc = new Document({
      trackingNumber,
      docType: data.documentType || data.docType || data.doc_type || 'general',
      residentName: data.residentName || data.name || '',
      formData,
      pickupCode,
      status: data.status || 'pending',
      appointmentDatetime: data.appointmentDatetime || data.appointment_datetime,
      remarks: data.remarks || '',
    });

    await doc.save();
    res.status(201).json(mapDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download document by tracking number
router.get('/download/:trackingNumber', async (req, res) => {
  try {
    const doc = await Document.findOne({ trackingNumber: req.params.trackingNumber });
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // If there's a certificate URL, use that
    if (doc.certificateUrl) {
      // If it's a Cloudinary URL, add download parameter
      if (doc.certificateUrl.includes('cloudinary')) {
        return res.redirect(`${doc.certificateUrl}?dl=1`);
      }
      return res.redirect(doc.certificateUrl);
    }

    // Otherwise, generate a certification record PDF
    const PDFDocument = require('pdfkit');
    const pdfDoc = new PDFDocument({ size: 'A4', margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="document-${doc.trackingNumber}.pdf"`);
    
    // Pipe to response
    pdfDoc.pipe(res);

    // Title
    pdfDoc.fontSize(20).font('Helvetica-Bold').text('Official Document', { align: 'center' });
    pdfDoc.moveDown(0.5);

    // Barangay Info
    pdfDoc.fontSize(11).font('Helvetica').text('Barangay Pulao, Anao, Pangasinan', { align: 'center' });
    pdfDoc.text('Automated Barangay Information System (ABIS)', { align: 'center' });
    pdfDoc.moveDown(1);

    // Line separator
    pdfDoc.moveTo(50, pdfDoc.y).lineTo(550, pdfDoc.y).stroke();
    pdfDoc.moveDown(1);

    // Document Details
    pdfDoc.fontSize(12).font('Helvetica-Bold').text('Document Details:', pdfDoc.x, pdfDoc.y);
    pdfDoc.moveDown(0.5);

    pdfDoc.fontSize(11).font('Helvetica');
    pdfDoc.text(`Tracking Number: ${doc.trackingNumber}`, { width: 500 });
    pdfDoc.text(`Resident Name: ${doc.residentName || 'N/A'}`, { width: 500 });
    pdfDoc.text(`Document Type: ${doc.docType || 'N/A'}`, { width: 500 });
    pdfDoc.text(`Request Date: ${new Date(doc.createdAt).toLocaleDateString()}`, { width: 500 });
    pdfDoc.text(`Status: ${doc.status?.replace(/_/g, ' ') || 'N/A'}`, { width: 500 });
    pdfDoc.moveDown(1);

    // Additional Information
    if (doc.purpose) {
      pdfDoc.fontSize(12).font('Helvetica-Bold').text('Purpose:', pdfDoc.x, pdfDoc.y);
      pdfDoc.moveDown(0.5);
      pdfDoc.fontSize(11).font('Helvetica').text(doc.purpose, { width: 500 });
      pdfDoc.moveDown(1);
    }

    if (doc.remarks) {
      pdfDoc.fontSize(12).font('Helvetica-Bold').text('Remarks:', pdfDoc.x, pdfDoc.y);
      pdfDoc.moveDown(0.5);
      pdfDoc.fontSize(11).font('Helvetica').text(doc.remarks, { width: 500 });
      pdfDoc.moveDown(1);
    }

    // Footer
    pdfDoc.moveTo(50, pdfDoc.y).lineTo(550, pdfDoc.y).stroke();
    pdfDoc.moveDown(0.5);
    pdfDoc.fontSize(9).font('Helvetica').text('This is an official document from the Barangay Information System.', { align: 'center' });
    pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });

    // Finalize PDF
    pdfDoc.end();

  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Download certification record as PDF by tracking number
router.get('/download-certification/:trackingNumber', async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const doc = await Document.findOne({ trackingNumber: req.params.trackingNumber });
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Create PDF
    const pdfDoc = new PDFDocument({ size: 'A4', margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certification-${doc.trackingNumber}.pdf"`);
    
    // Pipe to response
    pdfDoc.pipe(res);

    // Title
    pdfDoc.fontSize(20).font('Helvetica-Bold').text('Certification Record', { align: 'center' });
    pdfDoc.moveDown(0.5);

    // Barangay Info
    pdfDoc.fontSize(11).font('Helvetica').text('Barangay Pulao, Anao, Pangasinan', { align: 'center' });
    pdfDoc.text('Automated Barangay Information System (ABIS)', { align: 'center' });
    pdfDoc.moveDown(1);

    // Line separator
    pdfDoc.moveTo(50, pdfDoc.y).lineTo(550, pdfDoc.y).stroke();
    pdfDoc.moveDown(1);

    // Document Details
    pdfDoc.fontSize(12).font('Helvetica-Bold').text('Request Details:', pdfDoc.x, pdfDoc.y);
    pdfDoc.moveDown(0.5);

    pdfDoc.fontSize(11).font('Helvetica');
    pdfDoc.text(`Tracking Number: ${doc.trackingNumber}`, { width: 500 });
    pdfDoc.text(`Resident Name: ${doc.residentName || 'N/A'}`, { width: 500 });
    pdfDoc.text(`Document Type: ${doc.docType || 'N/A'}`, { width: 500 });
    pdfDoc.text(`Request Date: ${new Date(doc.createdAt).toLocaleDateString()}`, { width: 500 });
    pdfDoc.text(`Status: ${doc.status?.replace(/_/g, ' ') || 'N/A'}`, { width: 500 });
    pdfDoc.moveDown(1);

    // Certification Info
    pdfDoc.fontSize(12).font('Helvetica-Bold').text('Certification Record:', pdfDoc.x, pdfDoc.y);
    pdfDoc.moveDown(0.5);
    
    pdfDoc.fontSize(11).font('Helvetica');
    pdfDoc.text(`Number of Times Certified: ${doc.certificationCount || 0}`, { width: 500 });
    
    if (doc.crimeRecordStatus) {
      pdfDoc.text(`Crime Record Status: ${doc.crimeRecordStatus.toUpperCase()}`, { width: 500 });
    }
    
    pdfDoc.moveDown(1);

    // Payment Information
    if (doc.paymentMethod) {
      pdfDoc.fontSize(12).font('Helvetica-Bold').text('Payment Information:', pdfDoc.x, pdfDoc.y);
      pdfDoc.moveDown(0.5);
      pdfDoc.fontSize(11).font('Helvetica');
      pdfDoc.text(`Payment Method: ${doc.paymentMethod}`, { width: 500 });
      pdfDoc.text(`Payment Status: ${doc.paymentStatus || 'pending'}`, { width: 500 });
      pdfDoc.moveDown(1);
    }

    // Certificate Information
    if (doc.certificateFileName) {
      pdfDoc.fontSize(12).font('Helvetica-Bold').text('Certificate:', pdfDoc.x, pdfDoc.y);
      pdfDoc.moveDown(0.5);
      pdfDoc.fontSize(11).font('Helvetica');
      pdfDoc.text(`Certificate File: ${doc.certificateFileName}`, { width: 500 });
      pdfDoc.moveDown(1);
    }

    // Footer
    pdfDoc.moveTo(50, pdfDoc.y).lineTo(550, pdfDoc.y).stroke();
    pdfDoc.moveDown(0.5);
    pdfDoc.fontSize(9).font('Helvetica').text('This is an official certification record from the Barangay Information System.', { align: 'center' });
    pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });

    // Finalize PDF
    pdfDoc.end();

  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// track by trackingNumber query param (MUST BE BEFORE /:id GET route)
router.get('/track/by-number/:trackingNumber', async (req, res) => {
  try {
    const doc = await Document.findOne({ trackingNumber: req.params.trackingNumber });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(mapDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// get single
router.get('/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(mapDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// update partial
router.patch('/:id', async (req, res) => {
  try {
    const updates = req.body;
    const doc = await Document.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(mapDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// set status (POST) - used by frontend
router.post('/:id/set_status', async (req, res) => {
  try {
    const { status } = req.body;
    const updates = { status };
    if (status === 'issued' || status === 'ready_for_pickup') {
      updates.issuedAt = new Date();
    }
    const doc = await Document.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    // Attempt to notify requester via email and SMS if contact details present in formData
    try {
      const email = doc.formData && (doc.formData.email || doc.formData.contactEmail || doc.formData.residentEmail);
      const phone = doc.formData && (doc.formData.phone || doc.formData.contactPhone || doc.formData.mobile);
      const subject = `Your document request ${doc.trackingNumber} status: ${doc.status}`;
      const text = `Your request (${doc.trackingNumber}) is now '${doc.status}'.`;
      if (email) {
        await sendEmail({ to: email, subject, text });
      }
      if (phone) {
        await sendSMS({ to: phone, body: text });
      }
    } catch (notifErr) {
      console.warn('Failed to send notification:', notifErr.message || notifErr);
    }
    res.json(mapDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload certificate PDF for a document (admin only)
router.post('/:id/upload-certificate', upload.single('certificate'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const certificateUrl = `/uploads/certificates/${req.file.filename}`;
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      { 
        certificateUrl,
        certificateFileName: req.file.originalname,
        status: 'ready_for_pickup'
      },
      { new: true }
    );
    
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    // Notify user that certificate is ready
    try {
      const email = doc.formData && (doc.formData.email || doc.formData.contactEmail);
      const phone = doc.formData && (doc.formData.phone || doc.formData.contactPhone);
      if (email) {
        await sendEmail({ 
          to: email, 
          subject: `Your certificate is ready for pickup (${doc.trackingNumber})`,
          text: `Your certificate for ${doc.docType} is now ready for pickup. Tracking number: ${doc.trackingNumber}\n\nYou can download it using your tracking number.`
        });
      }
      if (phone) {
        await sendSMS({ 
          to: phone, 
          body: `Your certificate (${doc.trackingNumber}) is ready. Use your tracking number to download it.`
        });
      }
    } catch (notifErr) {
      console.warn('Failed to send notification:', notifErr.message);
    }
    
    res.json(mapDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set crime record status (admin only)
router.post('/:id/set-crime-record', async (req, res) => {
  try {
    const { crimeRecordStatus } = req.body;
    
    if (!['yes', 'no'].includes(crimeRecordStatus)) {
      return res.status(400).json({ error: 'Invalid crime record status. Must be "yes" or "no"' });
    }
    
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      { crimeRecordStatus },
      { new: true }
    );
    
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(mapDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Increment certification count (when user takes certification)
router.post('/:id/increment-certification', async (req, res) => {
  try {
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      { $inc: { certificationCount: 1 } },
      { new: true }
    );
    
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(mapDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update payment status
router.post('/:id/update-payment', async (req, res) => {
  try {
    const { paymentMethod, paymentStatus, paymentProofUrl } = req.body;
    
    const updates = {};
    if (paymentMethod) updates.paymentMethod = paymentMethod;
    if (paymentStatus) updates.paymentStatus = paymentStatus;
    if (paymentProofUrl) updates.paymentProofUrl = paymentProofUrl;
    
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );
    
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(mapDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// delete
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Document.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
