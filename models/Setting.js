const mongoose = require('mongoose');
const { Schema } = mongoose;

const SettingSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed }
});

module.exports = mongoose.model('Setting', SettingSchema);
