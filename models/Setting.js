const mongoose = require('mongoose');
const { Schema } = mongoose;

const SettingSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed },
  updatedAt: { type: Date, default: Date.now }
});

// Initialize with default settings if they don't exist
SettingSchema.statics.ensureDefaults = async function() {
  const defaults = {
    'total_population': 10000,
    'gcash_qr_code_url': '',
    'application_name': 'ABIS'
  };
  
  for (const [key, value] of Object.entries(defaults)) {
    const existing = await this.findOne({ key });
    if (!existing) {
      await this.create({ key, value });
    }
  }
};

module.exports = mongoose.model('Setting', SettingSchema);
