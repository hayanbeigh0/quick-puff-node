const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    image: {
      type: String,
    },
    description: {
      type: String,
    },
    categories: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'ProductCategory',
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

brandSchema.index({ categories: 1 });

const Brand = mongoose.model('Brand', brandSchema);

module.exports = Brand