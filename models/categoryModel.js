const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    upperCase: true,
  },
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
