const mongoose = require('mongoose');
const AppError = require('../utils/appError');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      min: 0,
      required: true,
    },
    oldPrice: {
      type: Number,
      min: 0,
      required: true,
    },
    stock: {
      type: Number,
      min: 0,
      max: Infinity,
      default: Infinity,
      required: true,
    },
    puff: {
      type: Number,
      min: 0,
      max: Infinity,
      default: null,
      validate: {
        validator: function (v) {
          // Check if either puff or volume is set, but not both
          return this.volume == null || v == null;
        },
        message: 'Either puff or volume should be set, not both.',
      },
    },
    volume: {
      type: Number,
      min: 0,
      max: Infinity,
      default: null,
      validate: {
        validator: function (v) {
          // Check if either volume or puff is set, but not both
          return this.puff == null || v == null;
        },
        message: 'Either puff or volume should be set, not both.',
      },
    },
    nicotineStrength: {
      type: Number,
      min: 0,
      max: Infinity,
      default: 0,
      required: true,
    },
    usingSaltNicotine: {
      type: Boolean,
      required: true,
      default: false,
    },
    flavor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Flavor',
    },
    productCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductCategory',
      required: true,
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
    },
    soldCount: { type: Number, default: 0 }, // Total units sold
    reviewCount: { type: Number, default: 0 }, // Number of reviews
    averageRating: { type: Number, default: 0 }, // Average product rating
    viewCount: { type: Number, default: 0 }, // Number of times the product page was viewed
    wishlistCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
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

// Virtual field for 'available'
productSchema.virtual('available').get(function () {
  return this.stock > 0;
});

// Virtual field for 'hasDeal'
productSchema.virtual('hasDeal').get(function () {
  return this.oldPrice > this.price;
});

// Method to reduce stock based on quantity
productSchema.methods.reduceStock = async function (quantity) {
  if (this.stock >= quantity) {
    this.stock -= quantity;
    await this.save();
  } else {
    throw new AppError('Insufficient stock', 400);
  }
};

// Indexes
productSchema.index({ productCategory: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ name: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
