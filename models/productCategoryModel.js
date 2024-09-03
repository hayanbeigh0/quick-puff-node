const mongoose = require('mongoose');

const productCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    upperCase: true,
  },
  image: {
    type: String,
    required: true,
  },
  description: String,
});

productCategorySchema.index({ name: 1 });

const ProductCategory = mongoose.model(
  'ProductCategory',
  productCategorySchema,
);

module.exports = ProductCategory;
