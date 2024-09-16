const Product = require('../models/productModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const mongoose = require('mongoose');
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
  if (req.body.puff && req.body.volume) {
    return next(new AppError('Either puff or volume must be provided.', 400));
  }
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
    volume: req.body.volume,
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

  if (req.body.puff && req.body.volume) {
    return next(new AppError('Either puff or volume must be provided.', 400));
  }

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
      puff:
        req.body.puff !== undefined
          ? +req.body.puff
          : req.body.volume
            ? null
            : product.puff, // Set puff or null
      volume:
        req.body.volume !== undefined
          ? +req.body.volume
          : req.body.puff
            ? null
            : product.volume, // Set volume or null
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
              volume: 1,
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

const getPopularProducts = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  // Step 1: Fetch products and calculate popularityScore
  const popularProducts = await Product.aggregate([
    {
      $addFields: {
        popularityScore: {
          $add: [
            { $multiply: ['$soldCount', 0.5] },
            { $multiply: ['$reviewCount', 0.3] },
            { $multiply: ['$averageRating', 0.2] },
          ],
        },
      },
    },
    {
      $sort: { popularityScore: -1 }, // Sort by popularity score in descending order
    },
    {
      $skip: (page - 1) * limit, // Pagination logic
    },
    {
      $limit: limit, // Limit the number of results
    },
    {
      $project: {
        id: '$_id',
        name: 1,
        image: 1,
        price: 1,
        puff: 1,
        volume: 1,
        stock: 1,
        nicotineStrength: 1,
        flavor: 1,
        averageRating: 1,
        soldCount: 1,
        reviewCount: 1,
        popularityScore: 1,
        hasDeal: { $gt: ['$oldPrice', '$price'] }, // Determine if the product has a deal
        _id: 0,
      },
    },
  ]);

  // Step 2: Get the total count for pagination
  const totalCount = await Product.countDocuments();

  // Calculate total pages
  const totalPages = Math.ceil(totalCount / limit);

  // Step 3: Return the response
  res.status(200).json({
    status: 'success',
    products: popularProducts,
    pageInfo: {
      page,
      limit,
      totalPages,
      totalItems: totalCount,
    },
  });
});

const getProductFilter = catchAsync(async (req, res, next) => {
  const predefinedPuffs = [2500, 5000, 6000, 6500, 7000];
  const predefinedNicotineStrengths = [3, 6, 9, 12, 30, 50];

  const { brandId, categoryId } = req.params; // Get brandId and categoryId from req.params

  const filters = await Product.aggregate([
    {
      $match: {
        brand: mongoose.Types.ObjectId(brandId), // Filter by brand
        productCategory: mongoose.Types.ObjectId(categoryId), // Filter by product category
      },
    },
    {
      $facet: {
        // Flavors
        flavors: [
          {
            $lookup: {
              from: 'flavors',
              localField: 'flavor',
              foreignField: '_id',
              as: 'flavorDetails',
            },
          },
          {
            $unwind: {
              path: '$flavorDetails',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $group: {
              _id: '$flavorDetails._id',
              name: { $first: '$flavorDetails.name' },
              count: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: 'flavors',
              pipeline: [{ $project: { name: 1 } }],
              as: 'allFlavors',
            },
          },
          {
            $unwind: '$allFlavors',
          },
          {
            $project: {
              _id: '$allFlavors._id',
              name: '$allFlavors.name',
              count: {
                $cond: [{ $eq: ['$allFlavors._id', '$_id'] }, '$count', 0],
              },
            },
          },
          {
            $group: {
              _id: { id: '$_id', name: '$name' },
              count: { $max: '$count' },
            },
          },
          {
            $project: {
              _id: 0,
              id: '$_id.id',
              name: '$_id.name',
              count: 1,
            },
          },
        ],

        // Predefined puff options
        maxPuffs: [
          {
            $group: {
              _id: '$puff',
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              puff: '$_id',
              count: 1,
              _id: 0,
            },
          },
          {
            $group: {
              _id: null,
              data: { $push: { puff: '$puff', count: '$count' } },
            },
          },
          {
            $addFields: {
              predefinedPuffs: predefinedPuffs.map((puff) => ({
                puff,
                count: 0,
              })),
            },
          },
          {
            $project: {
              puffs: {
                $map: {
                  input: predefinedPuffs,
                  as: 'puffValue',
                  in: {
                    puff: '$$puffValue',
                    count: {
                      $cond: {
                        if: { $in: ['$$puffValue', '$data.puff'] },
                        then: {
                          $arrayElemAt: [
                            '$data.count',
                            { $indexOfArray: ['$data.puff', '$$puffValue'] },
                          ],
                        },
                        else: 0,
                      },
                    },
                  },
                },
              },
            },
          },
        ],

        // Predefined nicotine strength options
        nicotineStrength: [
          {
            $match: {
              nicotineStrength: { $in: [3, 6, 9, 12, 30, 50] },
            },
          },
          {
            $project: {
              nicotineStrength: 1,
              usingSaltNicotine: {
                $cond: {
                  if: { $in: ['$nicotineStrength', [30, 50]] },
                  then: true,
                  else: false,
                },
              },
            },
          },
          {
            $group: {
              _id: {
                nicotineStrength: '$nicotineStrength',
                usingSaltNicotine: '$usingSaltNicotine',
              },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              nicotineStrength: '$_id.nicotineStrength',
              usingSaltNicotine: '$_id.usingSaltNicotine',
              count: 1,
              _id: 0,
            },
          },
        ],
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    filters: {
      flavor: filters[0].flavors,
      maxPuffs: filters[0].maxPuffs[0].puffs,
      nicotineStrength: filters[0].nicotineStrength,
    },
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
  getPopularProducts,
  getProductFilter,
};
