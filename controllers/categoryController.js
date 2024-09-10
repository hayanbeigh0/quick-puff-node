const Brand = require('../models/brandModel');
const catchAsync = require('../utils/catchAsync');
const mongoose = require('mongoose');
const { nodeCacheProvider } = require('../providers/cacheProvider'); // Path to your NodeCache provider
const createCacheService = require('../services/cacheService'); // Path to your cache service
const Product = require('../models/productModel');
const ProductCategory = require('../models/productCategoryModel');

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
    const productsLimit = parseInt(req.query.productsLimit, 10) || 8;

    const cacheKey = `brands-${productCategoryId}-page-${page}-limit-${limit}`;

    // Try to get the cached response
    let cachedResponse;
    // const cachedResponse = await cacheService.getItem(cacheKey);
    if (cachedResponse) {
      return res.status(200).json(cachedResponse);
    }

    const productCategoryIdObj = mongoose.Types.ObjectId(productCategoryId);

    // Step 1: Count the total number of brands with products
    const totalBrandsCount = await ProductCategory.aggregate([
      {
        $match: { _id: productCategoryIdObj },
      },
      {
        $lookup: {
          from: 'brandcategories',
          localField: '_id',
          foreignField: 'productCategories',
          as: 'matchedBrandCategories',
        },
      },
      {
        $unwind: '$matchedBrandCategories',
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'matchedBrandCategories._id',
          foreignField: 'categories',
          as: 'brandsSellingCategory',
        },
      },
      {
        $unwind: '$brandsSellingCategory',
      },
      {
        $lookup: {
          from: 'products',
          localField: 'brandsSellingCategory._id',
          foreignField: 'brand',
          as: 'productsForBrand',
        },
      },
      {
        $unwind: {
          path: '$productsForBrand',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: '$brandsSellingCategory._id',
          name: { $first: '$brandsSellingCategory.name' },
          image: { $first: '$brandsSellingCategory.image' },
          products: { $push: '$productsForBrand' },
        },
      },
      {
        $match: {
          'products.0': { $exists: true }, // Only count brands with products
        },
      },
    ]);

    const totalBrands = totalBrandsCount.length;

    // Step 2: Fetch paginated brands with products
    const brandsSellingCategory = await ProductCategory.aggregate([
      {
        $match: {
          _id: productCategoryIdObj,
        },
      },
      {
        $lookup: {
          from: 'brandcategories',
          localField: '_id',
          foreignField: 'productCategories',
          as: 'matchedBrandCategories',
        },
      },
      {
        $unwind: '$matchedBrandCategories',
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'matchedBrandCategories._id',
          foreignField: 'categories',
          as: 'brandsSellingCategory',
        },
      },
      {
        $unwind: '$brandsSellingCategory',
      },
      {
        $lookup: {
          from: 'products',
          localField: 'brandsSellingCategory._id',
          foreignField: 'brand',
          as: 'productsForBrand',
        },
      },
      {
        $unwind: {
          path: '$productsForBrand',
          preserveNullAndEmptyArrays: true, // Include brands without products
        },
      },
      {
        $project: {
          _id: 0,
          id: '$brandsSellingCategory._id',
          name: '$brandsSellingCategory.name',
          image: '$brandsSellingCategory.image',
          brandCategoryName: '$matchedBrandCategories.name',
          product: {
            id: '$productsForBrand._id',
            name: '$productsForBrand.name',
            image: '$productsForBrand.image',
            price: '$productsForBrand.price',
            puff: '$productsForBrand.puff',
            volume: '$productsForBrand.volume',
          },
        },
      },
      {
        $group: {
          _id: '$id',
          name: { $first: '$name' },
          image: { $first: '$image' },
          brandCategoryName: { $first: '$brandCategoryName' },
          products: { $push: '$product' },
        },
      },
      {
        // Filter out brands that have no products or products with empty objects
        $project: {
          id: '$_id',
          name: 1,
          image: 1,
          brandCategoryName: 1,
          products: {
            $filter: {
              input: '$products',
              as: 'product',
              cond: { $ne: ['$$product.id', null] }, // Only include valid products
            },
          },
        },
      },
      {
        $match: {
          'products.0': { $exists: true }, // Filter out brands with no products
        },
      },
      {
        $sort: {
          'name': 1, // Sort brands by name (or any other consistent field)
        },
      },
    ]);

    // Step 3: Apply sorting, limit, and pagination to brandsSellingCategory
    const sortedBrands = brandsSellingCategory
      .sort((a, b) => a.name.localeCompare(b.name)) // Ensure consistent sorting by brand name
      .slice(0, 8); // Limit to 8 items

    // Step 4: Apply productsLimit to brandsAndProducts
    const brandsAndProducts = sortedBrands
      .map((brand) => {
        const sortedProducts = brand.products
          .sort((a, b) => a.name.localeCompare(b.name)) // Sort products consistently
          .slice(0, productsLimit); // Limit the number of products

        const totalProducts = brand.products.length;
        const remainingItems =
          totalProducts - productsLimit > 0
            ? totalProducts - productsLimit
            : 0;

        return {
          id: brand.id,
          name: brand.name,
          products: sortedProducts.map((product) => ({
            id: product.id,
            name: product.name,
            image: product.image,
            price: product.price,
            puff: product.puff,
            volume: product.volume,
          })),
          remainingItems, // Remaining products count
        };
      })
      .filter((brand) => brand.products.length > 0) // Filter out brands without products
      .slice((page - 1) * limit, page * limit); // Pagination for productsAndBrands

    // Step 5: Add pagination information
    const pageInfo = {
      page,
      limit,
      totalPages: Math.ceil(totalBrands / limit),
      totalItems: totalBrands,
    };

    // Cache the response
    const response = {
      brandCategoryName:
        sortedBrands.length > 0
          ? sortedBrands[0].brandCategoryName // Use brandCategoryName from the aggregation
          : '',

      brands: sortedBrands.map((brand) => ({
        name: brand.name,
        image: brand.image,
        id: brand.id,
      })),

      brandsAndProducts,
    };

    await cacheService.save(cacheKey, response, 600); // Cache for 10 minutes

    // Final response
    return res.status(200).json({ status: 'success', ...response, pageInfo });
  }
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
