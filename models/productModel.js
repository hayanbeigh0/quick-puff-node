const mongoose = require('mongoose');
const AppError = require('../utils/appError');

// Sub-schema for quantity options
const quantityOptionSchema = new mongoose.Schema(
  {
    value: {
      type: Number,
      min: 0,
    },
    unit: {
      type: String,
      enum: ['puffs', 'ml', 'oz', 'in', 'ct'], // Add other units as needed
    },
  },
  { _id: false } // Prevent auto-generated _id for subdocuments
);

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
    quantity: {
      value: {
        type: Number,
        min: 0,
        default: null,
      },
      unit: {
        type: String,
        enum: ['puffs', 'ml', 'oz', 'in', 'ct'], // Add other units as needed
        default: null,
      },
    },
    quantityOptions: [quantityOptionSchema], // Use the sub-schema
    nicotineStrength: {
      type: Number,
      min: 0,
      max: Infinity,
      default: 0,
      required: true,
    },
    nicotineStrengthOptions: {
      type: [Number],
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
    flavorOptions: {
      type: [mongoose.Schema.Types.ObjectId],
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
    ingredients: [
      {
        type: String,
        required: true,
      },
    ],
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
  }
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
productSchema.index({ productCategory: 1, brand: 1 }); // Compound index

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
