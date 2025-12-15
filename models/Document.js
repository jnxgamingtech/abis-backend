const mongoose = require('mongoose');
const { Schema } = mongoose;

const DocumentSchema = new Schema({
  trackingNumber: { type: String, required: true, unique: true },
  docType: { type: String, required: true },
  residentName: { type: String },
  formData: { type: Schema.Types.Mixed },
  status: { type: String, enum: ['pending','accepted','rejected','issued','ready_for_pickup'], default: 'pending' },
  pickupCode: { type: String },
  remarks: { type: String },
  appointmentDatetime: { type: Date },
  issuedAt: { type: Date },
  // Payment fields
  paymentMethod: { type: String, enum: ['gcash', 'cash', 'none'], default: 'none' },
  paymentStatus: { type: String, enum: ['unpaid', 'pending_verification', 'paid'], default: 'unpaid' },
  paymentProofUrl: { type: String },
  // Certificate fields
  certificateUrl: { type: String },
  certificateFileName: { type: String },
  // Certification tracking
  certificationCount: { type: Number, default: 0 },
  crimeRecordStatus: { type: String, enum: ['unknown', 'yes', 'no'], default: 'unknown' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Document', DocumentSchema);
