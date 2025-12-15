const express = require('express');
const multer = require('multer');
const router = express.Router();

const upload = multer({ dest: 'uploads/' });

router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // Placeholder: Integration with OCR service could go here.
  res.json({ text: 'recognized text placeholder', filename: req.file.filename });
});

module.exports = router;
