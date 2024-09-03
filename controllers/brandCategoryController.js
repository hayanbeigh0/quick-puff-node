const BrandCategory = require('../models/brandCategoryModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');

// Controller function to handle brand category creation
const createBrandCategory = catchAsync(async (req, res, next) => {
  console.log(req.body);
  // Create the brand with the image URL
  const brandCategory = await BrandCategory.create({
    name: req.body.name,
    description: req.body.description,
    productCategories: req.body.productCategories,
  });

  res.status(201).json({
    status: 'success',
    data: {
      brandCategory,
    },
  });
});

const getBrandCategories = factory.getAll(BrandCategory);

// Controller function to handle brand category update
const updateBrandCategory = catchAsync(async (req, res, next) => {
  const { id } = req.body;
  console.log(req.file);

  // Find the brand by ID
  const brandCategory = await BrandCategory.findById(id);
  if (!brandCategory)
    return next(new AppError('Brand category not found', 404));

  // Update the brand category
  const updatedBrandCategory = await BrandCategory.findByIdAndUpdate(
    id,
    {
      name: req.body.name || brandCategory.name,
      description: req.body.description || brandCategory.description,
      productCategories:
        req.body.productCategories || brandCategory.productCategories,
    },
    {
      new: true, // Return the updated document
      runValidators: true, // Run validators on the update
    },
  );

  res.status(200).json({
    status: 'success',
    data: {
      brand: updatedBrandCategory,
    },
  });
});

const deleteBrandCategory = catchAsync(async (req, res, next) => {
  const { categoryId } = req.params;

  // Delete the brand from the database
  await BrandCategory.findByIdAndDelete(categoryId);

  res.status(204).json({
    status: 'success',
    message: 'Brand category deleted successfully',
  });
});

// Export middleware and controller functions
module.exports = {
  createBrandCategory,
  getBrandCategories,
  updateBrandCategory,
  deleteBrandCategory,
};
