const ProductCategory = require('../models/productCategoryModel');
const ServiceableLocation = require('../models/serviceableLocation');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');

// Controller function to handle product category creation
const createProductCategory = catchAsync(async (req, res, next) => {
  console.log(req.body);
  const publicId = await uploadImage(req.file, 'product_category');
  const assetInfo = getImageUrl(publicId);

  // Create the product with the image URL
  const productCategory = await ProductCategory.create({
    name: req.body.name,
    image: assetInfo, // Store the image URL in the image property
    description: req.body.description,
  });

  res.status(201).json({
    status: 'success',
    data: {
      productCategory,
    },
  });
});

const getProductCategories = factory.getAll(ProductCategory);

// Export middleware and controller functions
module.exports = {
  createProductCategory,
  getProductCategories,
};
