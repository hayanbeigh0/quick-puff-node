const mongoose = require('mongoose');
const AppError = require('../utils/appError');

const advertisementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product', // Reference to the Product model
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String, // Path to the advertisement image
      required: true,
    },
    link: {
      type: String, // URL or route where the ad will redirect the user
      required: true,
    },
    startDate: {
      type: Date, // When the ad becomes active
      default: Date.now,
    },
    endDate: {
      type: Date, // When the ad ends
    },
    isActive: {
      type: Boolean, // To determine if the ad is currently active
      default: true,
    },
    viewCount: {
      type: Number, // How many times the ad was viewed
      default: 0,
    },
    clickCount: {
      type: Number, // How many times the ad was clicked
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  },
);

// Method to increment view count
advertisementSchema.methods.incrementViewCount = async function () {
  this.viewCount += 1;
  await this.save();
};

// Method to increment click count
advertisementSchema.methods.incrementClickCount = async function () {
  this.clickCount += 1;
  await this.save();
};

// Indexes
advertisementSchema.index({ product: 1, isActive: 1 });

const Advertisement = mongoose.model('Advertisement', advertisementSchema);

module.exports = Advertisement;
