const mongoose = require('mongoose');

const productCategorySchema = new mongoose.Schema(
  {
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

productCategorySchema.index({ name: 1 });

const ProductCategory = mongoose.model(
  'ProductCategory',
  productCategorySchema,
);

module.exports = ProductCategory;
