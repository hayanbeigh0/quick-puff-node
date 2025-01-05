// Assuming MongoDB with Mongoose
const mongoose = require('mongoose');

const errorLogSchema = new mongoose.Schema({
  message: { type: String, required: true }, // Error message
  stack_trace: { type: String }, // Stack trace of the error
  request_url: { type: String }, // URL where the error occurred
  request_method: { type: String }, // HTTP method (GET, POST, etc.)
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User ID (if applicable)
  ip_address: { type: String }, // IP address from which the error originated
  created_at: { type: Date, default: Date.now }, // Timestamp of the error
});

const ErrorLog = mongoose.model('ErrorLog', errorLogSchema);

module.exports = ErrorLog;
