const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User', // Reference to the User model
      required: true,
    },
    comment: {
      type: String,
      maxlength: 500, // Limit the comment length
    },
  },
  {
    timestamps: true,
    _id: true,
    id: true, // Create a virtual 'id' field from '_id'
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
      },
    },
  },
);

// Optional: Create an index to improve query performance
feedbackSchema.index({ brand: 1, user: 1 }, { unique: true }); // One feedback per user per brand

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;
