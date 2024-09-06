const Brand = require('../models/brandModel');
const catchAsync = require('../utils/catchAsync');
const mongoose = require('mongoose');
const { nodeCacheProvider } = require('../providers/cacheProvider'); // Path to your NodeCache provider
const createCacheService = require('../services/cacheService'); // Path to your cache service
const Product = require('../models/productModel');

// Create the cache service instance with the NodeCache provider
const cacheService = createCacheService(nodeCacheProvider);

/**
 * Controller function to fetch brands and products based on a category ID.
 */
const getBrandsAndProductsByBrandCategory = catchAsync(
  async (req, res, next) => {
    const { productCategoryId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 8;

    const cacheKey = `brands-${productCategoryId}-page-${page}-limit-${limit}`;

    // Try to get the cached response
    const cachedResponse = await cacheService.getItem(cacheKey);
    if (cachedResponse) {
      return res.status(200).json(cachedResponse);
    }

    // Fetch brands and products from the database
    const brandsAndProducts = await Brand.aggregate([
      {
        $lookup: {
          from: 'brandcategories',
          let: {
            productCategoryId: mongoose.Types.ObjectId(productCategoryId),
          },
          pipeline: [
            {
              $match: {
                $expr: { $in: ['$$productCategoryId', '$productCategories'] },
              },
            },
            {
              $project: { _id: 1 }, // We only need the IDs of the matching brand categories
            },
          ],
          as: 'matchingBrandCategories',
        },
      },
      {
        $match: {
          'matchingBrandCategories.0': { $exists: true }, // Filter brands that have at least one matching brand category
        },
      },
      {
        $lookup: {
          from: 'products',
          let: { brandId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$brand', '$$brandId'] },
              },
            },
            {
              $facet: {
                products: [
                  { $limit: 10 }, // Limit to 10 products
                  {
                    $project: {
                      id: '$_id',
                      name: 1,
                      image: 1,
                      price: 1,
                      puff: 1,
                      volume: 1,
                      _id: 0,
                    },
                  },
                ],
                totalCount: [{ $count: 'count' }],
              },
            },
            {
              $addFields: {
                remainingItems: {
                  $let: {
                    vars: {
                      totalItems: { $arrayElemAt: ['$totalCount.count', 0] },
                    },
                    in: { $max: [{ $subtract: ['$$totalItems', 10] }, 0] },
                  },
                },
              },
            },
            {
              $project: {
                totalCount: 0,
              },
            },
          ],
          as: 'productsData',
        },
      },
      {
        $addFields: {
          productsData: {
            $cond: {
              if: { $eq: [{ $size: '$productsData' }, 0] },
              then: [],
              else: { $arrayElemAt: ['$productsData', 0] },
            },
          },
        },
      },
      {
        $facet: {
          brandsAndProducts: [
            {
              $match: { 'productsData.products.0': { $exists: true } },
            },
            {
              $project: {
                id: '$_id',
                brandName: '$name',
                products: '$productsData.products',
                remainingItems: '$productsData.remainingItems',
                _id: 0,
              },
            },
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
          brands: [
            {
              $match: { 'productsData.products.0': { $exists: false } },
            },
            {
              $project: {
                id: '$_id',
                brandName: '$name',
                image: 1,
                _id: 0,
              },
            },
          ],
        },
      },
    ]);

    const totalBrands = await Brand.countDocuments({
      categories: {
        $in: brandsAndProducts[0].brandsAndProducts.map((b) => b.id),
      },
    });

    const response = {
      status: 'success',
      brands: brandsAndProducts[0].brands,
      brandsAndProducts: brandsAndProducts[0].brandsAndProducts,
      pageInfo: {
        page,
        limit,
        totalPages: Math.ceil(totalBrands / limit),
        totalItems: totalBrands,
      },
    };

    // Cache the response
    await cacheService.save(cacheKey, response, 600); // Cache for 10 minutes
    res.status(200).json(response);
  },
);

/**
 * Controller function to fetch products based on a brand ID and product category ID, with pagination and filtering.
 */
const getProductsByBrandAndCategory = catchAsync(async (req, res, next) => {
  const { brandId, productCategoryId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  // Extract filters from query params
  const {
    sortBy, // Sorting (e.g., "Most Relevant", "Price: Low to High")
    deals, // Boolean for deals
    available, // Boolean for availability
    flavor, // Flavor ObjectId
    maxPuff, // Maximum puff count
    nicotineStrength, // Nicotine Strength
    minPrice, // Minimum Price
    maxPrice, // Maximum Price
  } = req.query;

  // Define match filters
  const matchFilters = {
    brand: mongoose.Types.ObjectId(brandId),
    productCategory: mongoose.Types.ObjectId(productCategoryId),
  };

  // Apply filters based on query parameters
  if (deals) {
    matchFilters.$expr = { $gt: ['$oldPrice', '$price'] }; // Assuming deals mean discount (oldPrice exists)
  }

  if (available) {
    matchFilters.stock = { $gt: 0 }; // Products with stock greater than 0
  }

  if (flavor) {
    matchFilters.flavor = mongoose.Types.ObjectId(flavor);
  }

  if (maxPuff) {
    matchFilters.puff = { $lte: parseInt(maxPuff, 10) }; // Puff count should be less than or equal to maxPuff
  }

  if (nicotineStrength) {
    matchFilters.nicotineStrength = parseInt(nicotineStrength, 10); // Nicotine strength filter
  }

  if (minPrice || maxPrice) {
    matchFilters.price = {};
    if (minPrice) {
      matchFilters.price.$gte = parseInt(minPrice, 10); // Minimum price
    }
    if (maxPrice) {
      matchFilters.price.$lte = parseInt(maxPrice, 10); // Maximum price
    }
  }

  // Define sorting options
  const sortOptions = {};
  switch (sortBy) {
    case 'popularity':
      sortOptions.popularityScore = -1;
      break;
    case 'price-low-to-high':
      sortOptions.price = 1;
      break;
    case 'price-high-to-low':
      sortOptions.price = -1;
      break;
    case 'new-arrivals':
      sortOptions.createdAt = -1; // Sort by creation date for new arrivals
      break;
    case 'discount':
      sortOptions.oldPrice = -1; // Assume discount is determined by oldPrice
      break;
    default:
      sortOptions.relevance = -1; // Default sorting (most relevant)
  }

  const products = await Product.aggregate([
    {
      $match: matchFilters, // Apply all filters here
    },
    {
      // Add computed field for popularityScore
      $addFields: {
        popularityScore: {
          $add: [
            { $multiply: ['$soldCount', 0.5] }, // Adjust weights as needed
            { $multiply: ['$reviewCount', 0.3] },
            { $multiply: ['$averageRating', 0.2] },
          ],
        },
      },
    },
    {
      $facet: {
        products: [
          { $sort: sortOptions }, // Apply sorting options
          { $skip: (page - 1) * limit },
          { $limit: limit }, // Pagination
          {
            $project: {
              id: '$_id',
              name: 1,
              image: 1,
              price: 1,
              puff: 1,
              volume: 1,
              stock: 1, // Add stock to show availability
              nicotineStrength: 1,
              flavor: 1,
              averageRating: 1,
              hasDeal: { $gt: ['$oldPrice', '$price'] }, // Check for deal status
              _id: 0,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
    {
      $addFields: {
        remainingItems: {
          $let: {
            vars: {
              totalItems: { $arrayElemAt: ['$totalCount.count', 0] },
            },
            in: { $max: [{ $subtract: ['$$totalItems', limit] }, 0] },
          },
        },
      },
    },
    {
      $project: {
        totalCount: 0,
      },
    },
    {
      $replaceRoot: {
        newRoot: {
          productsByBrandAndCategory: {
            products: '$products',
            remainingItems: '$remainingItems',
          },
        },
      },
    },
  ]);

  res.status(200).json(
    { status: 'success', ...products[0] } || {
      productsByBrandAndCategory: {
        status: 'success',
        products: [],
        remainingItems: 0,
      },
    },
  );
});

const getTotalProductsCountByBrandAndCategory = catchAsync(
  async (req, res, next) => {
    const { brandId, productCategoryId } = req.params;

    // Extract filters from query params
    const {
      deals, // Boolean for deals
      available, // Boolean for availability
      flavor, // Flavor ObjectId
      maxPuff, // Maximum puff count
      nicotineStrength, // Nicotine Strength
      minPrice, // Minimum Price
      maxPrice, // Maximum Price
    } = req.query;

    // Define match filters
    const matchFilters = {
      brand: mongoose.Types.ObjectId(brandId),
      productCategory: mongoose.Types.ObjectId(productCategoryId),
    };

    // Apply filters based on query parameters
    if (deals) {
      matchFilters.$expr = { $gt: ['$oldPrice', '$price'] }; // Assuming deals mean discount (oldPrice exists)
    }

    if (available) {
      matchFilters.stock = { $gt: 0 }; // Products with stock greater than 0
    }

    if (flavor) {
      matchFilters.flavor = mongoose.Types.ObjectId(flavor);
    }

    if (maxPuff) {
      matchFilters.puff = { $lte: parseInt(maxPuff, 10) }; // Puff count should be less than or equal to maxPuff
    }

    if (nicotineStrength) {
      matchFilters.nicotineStrength = parseInt(nicotineStrength, 10); // Nicotine strength filter
    }

    if (minPrice || maxPrice) {
      matchFilters.price = {};
      if (minPrice) {
        matchFilters.price.$gte = parseInt(minPrice, 10); // Minimum price
      }
      if (maxPrice) {
        matchFilters.price.$lte = parseInt(maxPrice, 10); // Maximum price
      }
    }

    // Query to get the total number of matching products
    const totalProductsCount = await Product.aggregate([
      {
        $match: matchFilters, // Apply all filters
      },
      {
        $count: 'totalCount', // Count total matching products
      },
    ]);

    // Send the total count in the response
    res.status(200).json({
      status: 'success',
      totalProductsCount: totalProductsCount[0]?.totalCount || 0,
    });
  },
);

module.exports = {
  getBrandsAndProductsByBrandCategory,
  getProductsByBrandAndCategory,
  getTotalProductsCountByBrandAndCategory,
};
