const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
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
  productCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductCategory',
    required: true,
  },
  brandCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandCategory' },
});

productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
