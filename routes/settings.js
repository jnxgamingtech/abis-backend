const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const adminKeyMiddleware = require('../middleware/adminKey');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads/settings directory exists
const settingsUploadDir = path.join(__dirname, '../uploads/settings');
if (!fs.existsSync(settingsUploadDir)) {
  fs.mkdirSync(settingsUploadDir, { recursive: true });
}

// Configure multer for GCash QR code image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, settingsUploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, 'gcash-qr-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    // Only allow image files
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Upload GCash QR code image (admin only)
router.post('/gcash/upload-qr', adminKeyMiddleware, upload.single('qrImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileUrl = `/uploads/settings/${req.file.filename}`;
    const setting = await Setting.findOneAndUpdate(
      { key: 'gcash_qr_code_url' },
      { value: fileUrl, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    
    res.json({ 
      success: true, 
      gcash_qr_code_url: setting.value 
    });
  } catch (err) {
    console.error('[settings.gcash-upload] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Get GCash QR code
router.get('/gcash/qr-code', async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'gcash_qr_code_url' });
    res.json({ 
      gcash_qr_code_url: setting?.value || '' 
    });
  } catch (err) {
    console.error('[settings.gcash-get] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Upsert setting (admin only) - MUST BE BEFORE GET /:key
router.post('/:key', adminKeyMiddleware, async (req, res) => {
  try {
    const key = req.params.key;
    const value = req.body.value;
    
    console.log('[settings.post] Updating setting:', { key, value, bodyValue: req.body.value });
    
    const updated = await Setting.findOneAndUpdate(
      { key }, 
      { value, updatedAt: new Date() }, 
      { upsert: true, new: true }
    );
    
    console.log('[settings.post] Updated setting:', updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[settings.post] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a setting by key
router.get('/:key', async (req, res) => {
  try {
    const s = await Setting.findOne({ key: req.params.key });
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (err) {
    console.error('[settings.get] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all settings - MUST BE BEFORE GET / routes to avoid catching /total_population as /
router.get('/', async (req, res) => {
  try {
    const settings = await Setting.find();
    const result = {};
    settings.forEach(s => {
      result[s.key] = s.value;
    });
    res.json(result);
  } catch (err) {
    console.error('[settings.get-all] error', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
