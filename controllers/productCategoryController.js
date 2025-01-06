const ProductCategory = require('../models/productCategoryModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');
const {
  uploadImage,
  getImageUrl,
  deleteImage,
  extractPublicIdFromUrl,
} = require('../utils/cloudfs');
const { clearProductCategoriesCache, clearHomeCache } = require('../utils/cacheManager');

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

  // Clear related caches
  clearProductCategoriesCache();
  clearHomeCache();

  res.status(201).json({
    status: 'success',
    data: {
      productCategory,
    },
  });
});

const getProductCategories = factory.getAll(ProductCategory);

// Controller function to handle product category update
const updateProductCategory = catchAsync(async (req, res, next) => {
  const { id } = req.body;
  console.log(req.file);

  // Find the product by ID
  const productCategory = await ProductCategory.findById(id);
  if (!productCategory) return next(new AppError('Product not found', 404));

  let assetInfo = productCategory.image; // Keep the existing image URL

  // If a new file is provided, upload it and update the image URL
  if (req.file) {
    // Delete the old image from Cloudinary if it exists
    if (productCategory.image) {
      const publicId = extractPublicIdFromUrl(productCategory.image);
      await deleteImage(publicId);
    }

    // Upload the new image
    const publicId = await uploadImage(req.file, 'product_category');
    assetInfo = getImageUrl(publicId);
  }

  // Update the product category
  const updatedProductCategory = await ProductCategory.findByIdAndUpdate(
    id,
    {
      name: req.body.name || productCategory.name,
      image: assetInfo,
      description: req.body.description || productCategory.description,
    },
    {
      new: true, // Return the updated document
      runValidators: true, // Run validators on the update
    },
  );

  // Clear the cache after updating
  clearProductCategoriesCache();

  res.status(200).json({
    status: 'success',
    data: {
      product: updatedProductCategory,
    },
  });
});

const deleteProductCategory = catchAsync(async (req, res, next) => {
  const { categoryId } = req.params;

  // Find the product by ID
  const product = await ProductCategory.findById(categoryId);
  if (!product) return next(new AppError('Product category not found', 404));

  // Delete the image from Cloudinary if it exists
  if (product.image) {
    const publicId = extractPublicIdFromUrl(product.image);
    await deleteImage(publicId);
  }

  // Delete the product from the database
  await ProductCategory.findByIdAndDelete(categoryId);

  // Clear the cache after deleting
  clearProductCategoriesCache();

  res.status(204).json({
    status: 'success',
    message: 'Product category deleted successfully',
  });
});

// Export middleware and controller functions
module.exports = {
  createProductCategory,
  getProductCategories,
  updateProductCategory,
  deleteProductCategory,
};
