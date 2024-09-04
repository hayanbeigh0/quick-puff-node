// yourController.js

const Brand = require('../models/brandModel');
const catchAsync = require('../utils/catchAsync');
const mongoose = require('mongoose');
const { nodeCacheProvider } = require('../providers/cacheProvider'); // Path to your NodeCache provider
const createCacheService = require('../services/cacheService'); // Path to your cache service
const BrandCategory = require('../models/brandCategoryModel');
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
    console.log(cachedResponse);
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
    console.log('saved');

    res.status(200).json(response);
  },
);

/**
 * Controller function to fetch products based on a brand ID and product category ID, with pagination.
 */
const getProductsByBrandAndCategory = catchAsync(async (req, res, next) => {
  const { brandId, productCategoryId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  const products = await Product.aggregate([
    {
      $match: {
        brand: mongoose.Types.ObjectId(brandId),
        productCategory: mongoose.Types.ObjectId(productCategoryId),
      },
    },
    {
      $facet: {
        products: [
          { $skip: (page - 1) * limit },
          { $limit: limit }, // Apply pagination
          {
            $project: {
              id: '$_id',
              name: 1,
              image: 1,
              price: 1,
              puff: 1,
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

  res
    .status(200)
    .json(
      products[0] || {
        productsByBrandAndCategory: { products: [], remainingItems: 0 },
      },
    );
});

module.exports = {
  getBrandsAndProductsByBrandCategory,
  getProductsByBrandAndCategory,
};
