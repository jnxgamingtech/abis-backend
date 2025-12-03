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
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Document', DocumentSchema);
