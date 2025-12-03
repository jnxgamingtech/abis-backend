const express = require('express');
const router = express.Router();
const Document = require('../models/Document');
const { nanoid } = require('nanoid');
const { sendEmail, sendSMS } = require('../utils/notify');

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

    // Merge all form fields including purpose, pickup status, etc into formData
    const formData = {
      ...data.formFields,
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

// track by trackingNumber query param
router.get('/track/by-number/:trackingNumber', async (req, res) => {
  try {
    const doc = await Document.findOne({ trackingNumber: req.params.trackingNumber });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(mapDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
