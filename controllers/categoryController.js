const catchAsync = require('../utils/catchAsync');
const mongoose = require('mongoose');
const { nodeCacheProvider } = require('../providers/cacheProvider');
const createCacheService = require('../services/cacheService');
const Product = require('../models/productModel');
const ProductCategory = require('../models/productCategoryModel');
const Brand = require('../models/brandModel');

const cacheService = createCacheService(nodeCacheProvider);

/**
 * Controller function to fetch brands and products based on a product category ID.
 */
const getBrandsAndProductsByBrandCategory = catchAsync(async (req, res, next) => {
    const { productCategoryId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 8;
    const productsLimit = parseInt(req.query.productsLimit, 10) || 10;

  const cacheKey = `category-${productCategoryId}-page-${page}-limit-${limit}`;

  // Try to get cached response
  let cachedResponse = await cacheService.getItem(cacheKey);
    if (cachedResponse) {
      return res.status(200).json(cachedResponse);
    }

  // Get the product category name
  const productCategory = await ProductCategory.findById(productCategoryId);
  if (!productCategory) {
    return next(new AppError('Product category not found', 404));
  }

  // Find brands that have products in this category
  const brandsWithProducts = await Brand.aggregate([
    {
      $match: {
        categories: { $in: [new mongoose.Types.ObjectId(productCategoryId)] }
      }
    },
    // Look up products for each brand
    {
      $lookup: {
        from: 'products',
        let: { brandId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$brand', '$$brandId'] },
                  { $eq: ['$productCategory', new mongoose.Types.ObjectId(productCategoryId)] }
                ]
              }
            }
          }
        ],
        as: 'products'
      }
    },
    // Only keep brands that have products
    {
      $match: {
        'products.0': { $exists: true }
      }
    },
    // Pagination
    {
      $skip: (page - 1) * limit
    },
    {
      $limit: limit
    },
    {
      $project: {
        _id: 1,
        name: 1,
        image: 1
      }
    }
  ]);

  // Get products for each brand
  const brandsWithProductDetails = await Promise.all(
    brandsWithProducts.map(async (brand) => {
      const products = await Product.find({
        brand: brand._id,
        productCategory: productCategoryId
      })
      .select('name image price stock quantity')
      .lean()
      .limit(productsLimit)
      .then(products => products.map(product => ({
        id: product._id,
        name: product.name,
        image: product.image,
        price: product.price,
        stock: product.stock,
        quantity: product.quantity
      })));

      const totalProducts = await Product.countDocuments({
        brand: brand._id,
        productCategory: productCategoryId
      });

      return {
        id: brand._id,
        name: brand.name,
        image: brand.image,
        products,
        remainingItems: Math.max(totalProducts - productsLimit, 0)
      };
    })
  );

  // Get total count of brands with products
  const totalBrands = await Brand.aggregate([
    {
      $match: {
        categories: { $in: [new mongoose.Types.ObjectId(productCategoryId)] }
      }
    },
    {
      $lookup: {
        from: 'products',
        let: { brandId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$brand', '$$brandId'] },
                  { $eq: ['$productCategory', new mongoose.Types.ObjectId(productCategoryId)] }
                ]
              }
            }
          }
        ],
        as: 'products'
      }
    },
    {
      $match: {
        'products.0': { $exists: true }
      }
    },
    {
      $count: 'total'
    }
  ]);

  const response = {
    status: 'success',
    brandCategoryName: productCategory.name,
    brands: brandsWithProducts.map(brand => ({
      name: brand.name,
      image: brand.image,
      id: brand._id
    })),
    brandsAndProducts: brandsWithProductDetails,
    pageInfo: {
      page,
      limit,
      totalPages: Math.ceil((totalBrands[0]?.total || 0) / limit),
      totalItems: totalBrands[0]?.total || 0
    }
  };

  // Cache the response
  await cacheService.save(cacheKey, response, 600); // Cache for 10 minutes

  res.status(200).json(response);
});

/**
 * Get brands by product category
 */
const getBrandsByProductCategory = catchAsync(async (req, res, next) => {
  const { productCategoryId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Find brands that have this product category
  const brands = await Brand.find({
    categories: productCategoryId
  })
    .select('name image _id')
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const totalBrands = await Brand.countDocuments({
    categories: productCategoryId
  });

  res.status(200).json({
    status: 'success',
    brands: brands.map(brand => ({
      id: brand._id,
      name: brand.name
    })),
    pageInfo: {
      page,
      limit,
      totalPages: Math.ceil(totalBrands / limit),
      totalItems: totalBrands
    }
  });
});

/**
 * Get products by brand and category
 */
const getProductsByBrandAndCategory = catchAsync(async (req, res, next) => {
  const { brandId, productCategoryId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  // Extract filters from query params
  const {
    sortBy,
    deals,
    available,
    flavor,
    maxQuantityValue,
    maxQuantityUnit,
    nicotineStrength,
    minPrice,
    maxPrice,
  } = req.query;

  // Define match filters
  const matchFilters = {
    brand: mongoose.Types.ObjectId(brandId),
    productCategory: mongoose.Types.ObjectId(productCategoryId),
  };

  // Apply filters based on query parameters
  if (deals) {
    matchFilters.$expr = { $gt: ['$oldPrice', '$price'] };
  }

  if (available) {
    matchFilters.stock = { $gt: 0 };
  }

  if (flavor) {
    matchFilters.flavor = mongoose.Types.ObjectId(flavor);
  }

  if (maxQuantityValue && maxQuantityUnit) {
    matchFilters['quantity.value'] = { $lte: parseInt(maxQuantityValue, 10) };
    matchFilters['quantity.unit'] = maxQuantityUnit.trim();
  }

  if (nicotineStrength) {
    matchFilters.nicotineStrength = parseInt(nicotineStrength, 10);
  }

  if (minPrice || maxPrice) {
    matchFilters.price = {};
    if (minPrice) {
      matchFilters.price.$gte = parseInt(minPrice, 10);
    }
    if (maxPrice) {
      matchFilters.price.$lte = parseInt(maxPrice, 10);
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
      sortOptions.createdAt = -1;
      break;
    case 'discount':
      sortOptions.oldPrice = -1;
      break;
    default:
      sortOptions.relevance = -1;
  }

  const products = await Product.aggregate([
    {
      $match: matchFilters,
    },
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
    // Lookup to populate flavor
    {
      $lookup: {
        from: 'flavors', // Name of the flavor collection
        localField: 'flavor', // Field in Product
        foreignField: '_id', // Field in Flavor collection
        as: 'flavorDetails', // Output field
      },
    },
    {
      $unwind: {
        path: '$flavorDetails',
        preserveNullAndEmptyArrays: true, // If no flavor found, it won't throw an error
      },
    },
    {
      $facet: {
        products: [
          { $sort: sortOptions },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              id: '$_id',
              name: 1,
              image: 1,
              price: 1,
              quantity: 1, // Include quantity object with value and unit
              stock: 1,
              nicotineStrength: 1,
              flavor: {
                id: '$flavorDetails._id', // Rename _id to id
                name: '$flavorDetails.name',
                createdAt: '$flavorDetails.createdAt',
                updatedAt: '$flavorDetails.updatedAt',
              },
              averageRating: 1,
              hasDeal: { $gt: ['$oldPrice', '$price'] },
              _id: 0, // Remove _id
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]);

  const totalCount = products[0].totalCount[0]?.count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  res.status(200).json({
    status: 'success',
    products: products[0].products || [],
    pageInfo: {
      page,
      limit,
      totalPages,
      totalItems: totalCount,
    },
  });
});

/**
 * Get total products count by brand and category
 */
const getTotalProductsCountByBrandAndCategory = catchAsync(async (req, res, next) => {
  const { brandId, productCategoryId } = req.params;

  // Extract filters from query params
  const {
    deals,
    available,
    flavor,
    maxQuantityValue,
    maxQuantityUnit,
    nicotineStrength,
    minPrice,
    maxPrice,
  } = req.query;

  // Define match filters
  const matchFilters = {
    brand: mongoose.Types.ObjectId(brandId),
    productCategory: mongoose.Types.ObjectId(productCategoryId),
  };

  // Apply filters based on query parameters
  if (deals) {
    matchFilters.$expr = { $gt: ['$oldPrice', '$price'] };
  }

  if (available) {
    matchFilters.stock = { $gt: 0 };
  }

  if (flavor) {
    matchFilters.flavor = mongoose.Types.ObjectId(flavor);
  }

  if (maxQuantityValue && maxQuantityUnit) {
    matchFilters['quantity.value'] = { $lte: parseInt(maxQuantityValue, 10) };
    matchFilters['quantity.unit'] = maxQuantityUnit.trim();
  }

  if (nicotineStrength) {
    matchFilters.nicotineStrength = parseInt(nicotineStrength, 10);
  }

  if (minPrice || maxPrice) {
    matchFilters.price = {};
    if (minPrice) {
      matchFilters.price.$gte = parseInt(minPrice, 10);
    }
    if (maxPrice) {
      matchFilters.price.$lte = parseInt(maxPrice, 10);
    }
  }

  const totalProducts = await Product.countDocuments(matchFilters);

  res.status(200).json({
    status: 'success',
    totalProducts
  });
});

module.exports = {
  getBrandsAndProductsByBrandCategory,
  getProductsByBrandAndCategory,
  getTotalProductsCountByBrandAndCategory,
  getBrandsByProductCategory
};
