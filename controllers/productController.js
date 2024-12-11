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
  console.log(req.body);
  const parseQuantity = (value, unit) => {
    if (!value || !unit) return null;
    return { value: parseFloat(value), unit: unit.trim() };
  };

  const parseQuantityOptions = (options) => {
    if (!Array.isArray(options)) return [];
    return options.map((option) => {
      if (typeof option === 'string') {
        try {
          // Parse the string into an object
          const parsedOption = JSON.parse(option);
          return {
            value: parseFloat(parsedOption.value),
            unit: parsedOption.unit.trim(),
          };
        } catch (err) {
          throw new AppError('Invalid quantityOptions format', 400);
        }
      } else if (typeof option === 'object' && option !== null) {
        return {
          value: parseFloat(option.value),
          unit: option.unit.trim(),
        };
      }
      throw new AppError('Invalid quantityOptions format', 400);
    });
  };


  // Parse quantity and quantityOptions
  const quantity = parseQuantity(req.body.quantityValue, req.body.quantityUnit);
  const quantityOptions = parseQuantityOptions(req.body.quantityOptions);

  // Convert string values to numbers where necessary
  const price = req.body.price ? parseFloat(req.body.price) : null;
  const oldPrice = req.body.oldPrice ? parseFloat(req.body.oldPrice) : null;
  const stock = req.body.stock ? parseInt(req.body.stock, 10) : null;
  const nicotineStrength = req.body.nicotineStrength
    ? parseInt(req.body.nicotineStrength, 10)
    : null;

  // Proceed with product creation after file upload
  const publicId = await uploadImage(req.file, 'products');
  const assetInfo = getImageUrl(publicId);

  // Create the product data dynamically
  const productData = {
    name: req.body.name,
    image: assetInfo, // Store the image URL in the image property
    description: req.body.description,
    price, // Use parsed number
    oldPrice, // Use parsed number
    stock, // Use parsed number
    productCategory: req.body.productCategory,
    brand: req.body.brand,
    flavor: req.body.flavor,
    flavorOptions: req.body.flavorOptions, // Handle stringified arrays
    ingredients: req.body.ingredients, // Handle comma-separated string
    nicotineStrength,
    nicotineStrengthOptions: req.body.nicotineStrengthOptions,
    quantity: quantity || null, // Unified quantity field
    quantityOptions: quantityOptions.length > 0 ? quantityOptions : null, // Optional quantity options
  };

  // Create the product
  const product = await Product.create(productData);

  // Respond with the newly created product
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

  // Helper function to parse quantity
  const parseQuantity = (value, unit) => {
    if (!value || !unit) return null;
    return { value: parseFloat(value), unit: unit.trim() };
  };

  // Helper function to parse quantity options
  const parseQuantityOptions = (options) => {
    if (!Array.isArray(options)) return [];
    return options.map((option) => {
      if (typeof option === 'string') {
        try {
          // Parse the string into an object
          const parsedOption = JSON.parse(option);
          return {
            value: parseFloat(parsedOption.value),
            unit: parsedOption.unit.trim(),
          };
        } catch (err) {
          throw new AppError('Invalid quantityOptions format', 400);
        }
      } else if (typeof option === 'object' && option !== null) {
        return {
          value: parseFloat(option.value),
          unit: option.unit.trim(),
        };
      }
      throw new AppError('Invalid quantityOptions format', 400);
    });
  };

  // Parse the quantity and quantityOptions
  const quantity = parseQuantity(req.body.quantityValue, req.body.quantityUnit);
  const quantityOptions = parseQuantityOptions(req.body.quantityOptions);

  // Update the product
  const updatedProduct = await Product.findByIdAndUpdate(
    id,
    {
      name: req.body.name || product.name,
      image: assetInfo,
      description: req.body.description || product.description,
      price: req.body.price ? parseFloat(req.body.price) : product.price,
      oldPrice: req.body.oldPrice ? parseFloat(req.body.oldPrice) : product.oldPrice,
      stock: req.body.stock ? parseInt(req.body.stock, 10) : product.stock,
      productCategory: req.body.productCategory || product.productCategory,
      brand: req.body.brand || product.brand,
      flavor: req.body.flavor || product.flavor,
      nicotineStrength: req.body.nicotineStrength
        ? parseInt(req.body.nicotineStrength, 10)
        : product.nicotineStrength,
      soldCount: req.body.soldCount ? parseInt(req.body.soldCount, 10) : product.soldCount,
      reviewCount: req.body.reviewCount
        ? parseInt(req.body.reviewCount, 10)
        : product.reviewCount,
      averageRating: req.body.averageRating
        ? parseFloat(req.body.averageRating)
        : product.averageRating,
      viewCount: req.body.viewCount ? parseInt(req.body.viewCount, 10) : product.viewCount,
      wishlistCount: req.body.wishlistCount
        ? parseInt(req.body.wishlistCount, 10)
        : product.wishlistCount,
      quantity: quantity || product.quantity,
      quantityOptions:
        quantityOptions.length > 0 ? quantityOptions : product.quantityOptions,
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

const getProduct = catchAsync(async (req, res, next) => {
  const { productId } = req.params;

  // Find the product by ID
  const product = await Product.findById(productId).populate(
    'flavor flavorOptions',
  );
  if (!product) return next(new AppError('Product not found', 404));

  res.status(200).json({
    status: 'success',
    product,
  });
});

const getProductPrice = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { quantityValue, quantityUnit, flavor, nicotineStrength } = req.body;

  // 1. Find the product by ID
  const product = await Product.findById(productId);

  if (!product) {
    return next(new AppError('Product not found', 404));
  }

  // 2. Set the base price to the product price
  let finalPrice = product.price;

  // 3. Adjust price based on quantity options if provided
  if (quantityValue && quantityUnit) {
    const matchingOption = product.quantityOptions.find(
      (option) =>
        option.value === parseFloat(quantityValue) &&
        option.unit === quantityUnit.trim()
    );

    if (!matchingOption) {
      return next(new AppError('Invalid quantity option', 400));
    }

    // Example: Add $5 if quantity value is 5000 or more (for puffs) or 20 or more (for ml)
    if (
      (quantityUnit.trim() === 'puffs' && quantityValue >= 5000) ||
      (quantityUnit.trim() === 'ml' && quantityValue >= 20)
    ) {
      finalPrice += 5;
    }
  }

  // 4. Adjust price based on nicotineStrength if provided
  if (nicotineStrength) {
    if (!product.nicotineStrengthOptions.includes(nicotineStrength)) {
      return next(new AppError('Invalid nicotine strength option', 400));
    }
    // Example: Add $2 if nicotine strength is 50mg or more
    if (nicotineStrength >= 5) {
      finalPrice += 2;
    }
  }

  // 5. Adjust price based on flavorOptions if provided
  if (flavor) {
    if (!product.flavorOptions.includes(flavor)) {
      return next(new AppError('Invalid flavor option', 400));
    }
    // Example: Add $1 for flavor option
    finalPrice += 1;
  }

  // 6. Send response with the final calculated price
  res.status(200).json({
    status: 'success',
    data: {
      productId: product.id,
      basePrice: product.price,
      finalPrice,
      selectedOptions: { quantityValue, quantityUnit, flavor, nicotineStrength },
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
              quantity: 1,
              stock: 1,
              nicotineStrength: 1,
              // flavor: 1,
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
  if (req.user) {
    await RecentSearch.findOneAndUpdate(
      { user: req.user.id, searchQuery: searchText },
      { user: req.user.id, searchQuery: searchText },
      { upsert: true, new: true },
    );
  }

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
        id: '$_id', // Map `_id` to `id`
        name: 1,
        image: 1,
        price: 1,
        // quantity: 1,
        stock: 1,
        nicotineStrength: 1,
        // flavor: 1,
        averageRating: 1,
        soldCount: 1,
        // reviewCount: 1,
        // popularityScore: 1,
        hasDeal: { $gt: ['$oldPrice', '$price'] }, // Determine if the product has a deal
        _id: 0, // Exclude `_id`
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
        // Flavors remain unchanged
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

        // Puff-related logic to handle quantities directly
        maxPuffs: [
          {
            $match: {
              'quantity.unit': 'puffs', // Match only quantities with the unit 'puffs'
            },
          },
          {
            $group: {
              _id: '$quantity.value', // Group by the puff value from quantity
              count: { $sum: 1 }, // Count occurrences of each puff value
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
      maxPuffs: filters[0].maxPuffs[0]?.puffs || [],
      nicotineStrength: filters[0].nicotineStrength || [],
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
  getProduct,
  getProductPrice,
};
