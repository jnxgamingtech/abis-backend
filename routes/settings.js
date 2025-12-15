const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const adminKeyMiddleware = require('../middleware/adminKey');

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

// Upsert setting (admin only)
router.post('/:key', adminKeyMiddleware, async (req, res) => {
  try {
    const key = req.params.key;
    const value = req.body.value;
    const updated = await Setting.findOneAndUpdate({ key }, { value }, { upsert: true, new: true });
    res.json(updated);
  } catch (err) {
    console.error('[settings.post] error', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
