const Product = require('../models/productModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');
const {
  uploadImage,
  getImageUrl,
  deleteImage,
  extractPublicIdFromUrl,
} = require('../utils/cloudfs');
const RecentSearch = require('../models/recentSearchModel');

// Controller function to handle product creation
const createProduct = catchAsync(async (req, res, next) => {
  // Proceed with product creation after file upload
  const publicId = await uploadImage(req.file, 'products');
  const assetInfo = getImageUrl(publicId);

  // Create the product with the image URL
  const product = await Product.create({
    name: req.body.name,
    image: assetInfo, // Store the image URL in the image property
    description: req.body.description,
    price: req.body.price,
    oldPrice: req.body.oldPrice,
    stock: req.body.stock,
    puff: req.body.puff,
    productCategory: req.body.productCategory,
    brand: req.body.brand,
  });

  res.status(201).json({
    status: 'success',
    data: {
      product,
    },
  });
});

// Controller function to handle product update
const updateProduct = catchAsync(async (req, res, next) => {
  const { id } = req.body;

  // Find the product by ID
  const product = await Product.findById(id);
  if (!product) return next(new AppError('Product not found', 404));

  let assetInfo = product.image; // Keep the existing image URL

  // If a new file is provided, upload it and update the image URL
  if (req.file) {
    // Delete the old image from Cloudinary if it exists
    if (product.image) {
      const publicId = extractPublicIdFromUrl(product.image);
      await deleteImage(publicId);
    }

    // Upload the new image
    const publicId = await uploadImage(req.file, 'products');
    assetInfo = getImageUrl(publicId);
  }

  // Update the product
  const updatedProduct = await Product.findByIdAndUpdate(
    id,
    {
      name: req.body.name || product.name,
      image: assetInfo,
      description: req.body.description || product.description,
      price: +req.body.price || product.price,
      oldPrice: +req.body.oldPrice || product.oldPrice,
      stock: req.body.stock || product.stock,
      puff: +req.body.puff || product.puff,
      productCategory: req.body.productCategory || product.productCategory,
      brand: req.body.brand || product.brand,
      flavor: req.body.flavor || product.flavor,
      nicotineStrength: +req.body.nicotineStrength || product.nicotineStrength,
      soldCount: +req.body.soldCount || product.soldCount,
      reviewCount: +req.body.reviewCount || product.reviewCount,
      averageRating: +req.body.averageRating || product.averageRating,
      viewCount: +req.body.viewCount || product.viewCount,
      wishlistCount: +req.body.wishlistCount || product.wishlistCount,
    },
    {
      new: true, // Return the updated document
      runValidators: true, // Run validators on the update
    },
  );

  res.status(200).json({
    status: 'success',
    data: {
      product: updatedProduct,
    },
  });
});

const deleteProduct = catchAsync(async (req, res, next) => {
  const { productId } = req.params;

  // Find the product by ID
  const product = await Product.findById(productId);
  if (!product) return next(new AppError('Product not found', 404));

  // Delete the image from Cloudinary if it exists
  if (product.image) {
    const publicId = extractPublicIdFromUrl(product.image);
    await deleteImage(publicId);
  }

  // Delete the product from the database
  await Product.findByIdAndDelete(productId);

  res.status(204).json({
    status: 'success',
    message: 'Product deleted successfully',
  });
});

const searchProducts = catchAsync(async (req, res, next) => {
  const { searchText } = req.query;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  if (!searchText) {
    return next(new AppError('Please provide a search query', 400));
  }

  // Define regex for case-insensitive and partial match
  const regex = new RegExp(searchText, 'i');

  // Search products by name using regex
  const products = await Product.aggregate([
    {
      $match: {
        name: { $regex: regex }, // Use regex for partial and case-insensitive match
      },
    },
    {
      $facet: {
        products: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              id: '$_id',
              name: 1,
              image: 1,
              price: 1,
              puff: 1,
              stock: 1,
              nicotineStrength: 1,
              flavor: 1,
              averageRating: 1,
              _id: 0,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
    {
      $project: {
        totalCount: 0,
      },
    },
  ]);

  // If products are found, add the search query to recent searches
  // Add the search query to recent searches
  await RecentSearch.findOneAndUpdate(
    { user: req.user.id, searchQuery: searchText },
    { user: req.user.id, searchQuery: searchText },
    { upsert: true, new: true },
  );

  res.status(200).json(
    { status: 'success', ...products[0] } || {
      productsByName: { status: 'success', products: [] },
    },
  );
});

const getSearchSuggestions = catchAsync(async (req, res, next) => {
  const query = req.query.searchText;

  if (!query) {
    return next(new AppError('Please provide a search query', 400));
  }

  // Define regex for case-insensitive and partial match
  const regex = new RegExp(query, 'i');

  // Find products where the name matches the regex
  const suggestions = await Product.find({ name: { $regex: regex } })
    .limit(10) // Limit to top 10 suggestions
    .select('name') // Only return product names
    .sort({ name: 1 }); // Optionally sort alphabetically

  res.status(200).json({
    status: 'success',
    suggestions,
  });
});

const getProducts = factory.getAll(Product);

// Export middleware and controller functions
module.exports = {
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
  searchProducts,
  getSearchSuggestions,
};
