const mongoose = require('mongoose');

const brandCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    productCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductCategory',
        required: true,
      },
    ],
  },
  {
    _id: true, // Ensure _id is created for each subdocument
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

brandCategorySchema.index({ name: 1 });

const BrandCategory = mongoose.model('BrandCategory', brandCategorySchema);

module.exports = BrandCategory;
