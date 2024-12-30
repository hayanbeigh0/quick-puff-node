const Brand = require('../models/brandModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');
const {
  uploadImage,
  getImageUrl,
  deleteImage,
  extractPublicIdFromUrl,
} = require('../utils/cloudfs');
const APIFeatures = require('../utils/apiFeatures');

// Controller function to handle brand creation
const createBrand = catchAsync(async (req, res, next) => {
  // Proceed with brand creation after file upload
  console.log(req.body);
  const publicId = await uploadImage(req.file, 'brands');
  const assetInfo = getImageUrl(publicId);

  // Create the brand with the image URL
  const brand = await Brand.create({
    name: req.body.name,
    image: assetInfo, // Store the image URL in the image property
    categories: req.body.categories,
  });

  res.status(201).json({
    status: 'success',
    data: {
      brand,
    },
  });
});

// Controller function to handle brand update
const updateBrand = catchAsync(async (req, res, next) => {
  const { id } = req.body;
  console.log(req.file);

  // Find the brand by ID
  const brand = await Brand.findById(id);
  if (!brand) return next(new AppError('Brand not found', 404));

  let assetInfo = brand.image; // Keep the existing image URL

  // If a new file is provided, upload it and update the image URL
  if (req.file) {
    // Delete the old image from Cloudinary if it exists
    if (brand.image) {
      const publicId = extractPublicIdFromUrl(brand.image);
      await deleteImage(publicId);
    }

    // Upload the new image
    const publicId = await uploadImage(req.file, 'brands');
    assetInfo = getImageUrl(publicId);
  }

  // Update the brand
  const updatedBrand = await Brand.findByIdAndUpdate(
    id,
    {
      name: req.body.name || brand.name,
      image: assetInfo,
      categories: req.body.categories || brand.categories,
      description: req.body.description || brand.description,
    },
    {
      new: true, // Return the updated document
      runValidators: true, // Run validators on the update
    },
  );

  res.status(200).json({
    status: 'success',
    data: {
      brand: updatedBrand,
    },
  });
});

const deleteBrand = catchAsync(async (req, res, next) => {
  const { brandId } = req.params;

  // Find the brand by ID
  const brand = await Brand.findById(brandId);
  if (!brand) return next(new AppError('Brand not found', 404));

  // Delete the image from Cloudinary if it exists
  if (brand.image) {
    const publicId = extractPublicIdFromUrl(brand.image);
    await deleteImage(publicId);
  }

  // Delete the brand from the database
  await Brand.findByIdAndDelete(brandId);

  res.status(204).json({
    status: 'success',
    message: 'Brand deleted successfully',
  });
});

// The function to get brands with pagination
const getBrands = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1; // Default to page 1 if no page param is provided
  const limit = parseInt(req.query.limit) || 10; // Default to 10 results per page if no limit param is provided

  // Calculate the number of documents to skip based on the current page and page size
  const skip = (page - 1) * limit;

  // Get total count of brands
  const totalBrands = await Brand.countDocuments();

  // Find brands with populated categories and productCategories, and apply pagination
  const brands = await Brand.find()
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'categories',
      select: '-__v',
      populate: {
        path: 'productCategories',
        model: 'ProductCategory', // Make sure to replace with the correct model name for ProductCategory
        select: '-__v',
      },
    }).select('-__v')
    .exec();

  // Calculate total pages
  const totalPages = Math.ceil(totalBrands / limit);

  // Return paginated results with page info
  res.status(200).json({
    status: 'success',
    brands,
    pageInfo: {
      page: page,
      limit: limit,
      totalPages: totalPages,
      totalItems: totalBrands,
    },
  });
});

const getBrandById = catchAsync(async (req, res, next) => {
  const { brandId } = req.params;

  const brand = await Brand.findById(brandId)
    .populate({
      path: 'categories',
      select: '-__v',
      populate: {
        path: 'productCategories',
        model: 'ProductCategory',
        select: '-__v',
      },
    })
    .select('-__v');

  if (!brand) {
    return next(new AppError('No brand found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      brand,
    },
  });
});

// Export middleware and controller functions
module.exports = {
  createBrand,
  deleteBrand,
  getBrands,
  updateBrand,
  getBrandById,
};
