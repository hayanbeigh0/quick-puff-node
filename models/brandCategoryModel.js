const mongoose = require('mongoose');

const brandCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  productCategories: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory' },
  ],
});

brandCategorySchema.index({ name: 1 });

const BrandCategory = mongoose.model('BrandCategory', brandCategorySchema);

module.exports = BrandCategory;
