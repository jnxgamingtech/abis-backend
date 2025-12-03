const mongoose = require('mongoose');

const { Schema } = mongoose;

const BlotterSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  reporterName: { type: String },
  reporterContact: { type: String },
  incidentDate: { type: Date, default: Date.now },
  
  // status flow: pending -> published -> investigating -> closed
  status: { type: String, enum: ['pending','published','investigating','closed'], default: 'pending' },
  
  // FIXED: Added url, public_id, width, height, format fields for Cloudinary
  attachments: [{ 
    filename: String,
    originalname: String, 
    path: String, 
    mimetype: String,
    url: String,           // ← ADD THIS
    public_id: String,     // ← ADD THIS
    width: Number,         // ← ADD THIS
    height: Number,        // ← ADD THIS
    format: String         // ← ADD THIS
  }],
  
  // token given to reporter so they can access their blotter without an account
  publicToken: { type: String, index: true },
  
  // NEW: Allow admin to control if reporter info is shown publicly
  showReporter: { type: Boolean, default: false },
  
  createdAt: { type: Date, default: Date.now },
  
}, { collection: 'blotter' });

module.exports = mongoose.model('Blotter', BlotterSchema, 'blotter');
