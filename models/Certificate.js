const mongoose = require('mongoose');
const { Schema } = mongoose;

const CertificateSchema = new Schema({
  trackingNumber: { type: String, required: true, index: true },
  filename: { type: String, required: true },
  originalname: { type: String },
  uploadedBy: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Certificate', CertificateSchema);
