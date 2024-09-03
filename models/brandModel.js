const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  image: {
    type: String,
  },
  categories: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'Category',
    },
  ],
});

const Brand = mongoose.model('Brand', brandSchema);

module.exports = Brand;
