const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const Certificate = require('../models/Certificate');
const adminKeyMiddleware = require('../middleware/adminKey');

// ensure upload dir exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'certificates');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_')}`;
    cb(null, safe);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Admin uploads certificate PDF for a tracking number
router.post('/', adminKeyMiddleware, upload.single('certificate'), async (req, res) => {
  try {
    const { trackingNumber } = req.body;
    if (!trackingNumber) return res.status(400).json({ error: 'trackingNumber required' });
    if (!req.file) return res.status(400).json({ error: 'certificate file required' });

    const cert = new Certificate({
      trackingNumber,
      filename: req.file.filename,
      originalname: req.file.originalname,
      uploadedBy: req.headers['x-admin-key'] ? 'admin' : 'unknown'
    });
    await cert.save();

    res.status(201).json({ success: true, certificate: cert });
  } catch (err) {
    console.error('[certificates.post] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Get certificate metadata by tracking number
router.get('/:trackingNumber', async (req, res) => {
  try {
    const t = req.params.trackingNumber;
    const cert = await Certificate.findOne({ trackingNumber: t }).sort({ createdAt: -1 });
    if (!cert) return res.status(404).json({ error: 'Not found' });
    res.json({ trackingNumber: cert.trackingNumber, originalname: cert.originalname, createdAt: cert.createdAt });
  } catch (err) {
    console.error('[certificates.get] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Download certificate file by tracking number
router.get('/download/:trackingNumber', async (req, res) => {
  try {
    const t = req.params.trackingNumber;
    const cert = await Certificate.findOne({ trackingNumber: t }).sort({ createdAt: -1 });
    if (!cert) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(uploadDir, cert.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath, cert.originalname || cert.filename);
  } catch (err) {
    console.error('[certificates.download] error', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
