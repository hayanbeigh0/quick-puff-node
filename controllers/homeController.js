const BrandCategory = require('../models/brandCategoryModel');
const ProductCategory = require('../models/productCategoryModel');
const Brand = require('../models/brandModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const NodeCache = require('node-cache');
const productCategoryCache = new NodeCache({ stdTTL: 3600 });

/**
 * Controller function to fetch and structure homepage data.
 * The data includes product categories and associated brands and products.
 */
const homePageData = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 2;
  const brandLimit = parseInt(req.query.brandLimit, 10) || 8;

  if (page < 1 || limit < 1) {
    return next(new AppError('Page and limit must be positive integers', 400));
  }

  // Try to get product categories from cache
  let productCategories = productCategoryCache.get('allProductCategories');
  let totalProductCategories;

  if (!productCategories) {
    // If not in cache, fetch from database
    productCategories = await ProductCategory.find()
      .select('name image')
      .lean();

    totalProductCategories = productCategories.length;

    // Cache the results for 1 hour (3600 seconds)
    productCategoryCache.set('allProductCategories', productCategories);
    productCategoryCache.set('totalProductCategories', totalProductCategories);
  } else {
    // Get total count from cache
    totalProductCategories = productCategoryCache.get('totalProductCategories');
  }

  // Get brands and their products for each product category
  const brandsData = await ProductCategory.aggregate([
    // Sort product categories (optional, add your preferred sorting)
    {
      $sort: { name: 1 }
    },
    // Apply pagination to product categories first
    {
      $skip: (page - 1) * limit
    },
    {
      $limit: limit
    },
    {
      $addFields: {
        productCategoryId: '$_id'
      }
    },
    // Look up brands that have this product category
    {
      $lookup: {
        from: 'brands',
        let: { categoryId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$$categoryId', '$categories']
              }
            }
          },
          {
            $project: {
              _id: 1,
              name: 1,
              image: 1
            }
          },
          // Always limit brands to brandLimit
          {
            $limit: brandLimit
          }
        ],
        as: 'brands'
      }
    },
    // Look up products for each brand in this category
    {
      $lookup: {
        from: 'products',
        let: { categoryId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$productCategory', '$$categoryId']
              }
            }
          },
          {
            $sort: { createdAt: -1 }
          },
          {
            $group: {
              _id: '$brand',
              products: {
                $push: {
                  _id: '$_id',
                  name: '$name',
                  image: '$image',
                  price: '$price',
                  quantity: '$quantity',
                  stock: '$stock',
                  brand: '$brand'
                }
              }
            }
          },
          {
            $project: {
              products: { $slice: ['$products', 0, limit] } // Use the same limit for products
            }
          }
        ],
        as: 'brandProducts'
      }
    },
    // Count total products for each brand in this category
    {
      $lookup: {
        from: 'products',
        let: { categoryId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$productCategory', '$$categoryId']
              }
            }
          },
          {
            $group: {
              _id: '$brand',
              total: { $sum: 1 }
            }
          }
        ],
        as: 'brandProductCounts'
      }
    },
    // Format the output
    {
      $project: {
        _id: 0,
        brandCategoryName: { $concat: ['$name', ' Brands'] },
        brands: {
          $map: {
            input: '$brands',
            as: 'brand',
            in: {
              id: '$$brand._id',
              name: '$$brand.name',
              image: '$$brand.image'
            }
          }
        },
        brandCategoryProducts: {
          $map: {
            input: '$brands',
            as: 'brand',
            in: {
              id: '$$brand._id',
              name: '$$brand.name',
              image: '$$brand.image',
              products: {
                $let: {
                  vars: {
                    brandProducts: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$brandProducts',
                            as: 'bp',
                            cond: { $eq: ['$$bp._id', '$$brand._id'] }
                          }
                        },
                        0
                      ]
                    }
                  },
                  in: '$$brandProducts.products'
                }
              },
              remainingItems: {
                $let: {
                  vars: {
                    brandCount: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$brandProductCounts',
                            as: 'count',
                            cond: { $eq: ['$$count._id', '$$brand._id'] }
                          }
                        },
                        0
                      ]
                    },
                    brandProducts: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$brandProducts',
                            as: 'bp',
                            cond: { $eq: ['$$bp._id', '$$brand._id'] }
                          }
                        },
                        0
                      ]
                    }
                  },
                  in: {
                    $max: [
                      {
                        $subtract: [
                          { $ifNull: ['$$brandCount.total', 0] },
                          {
                            $size: {
                              $ifNull: [
                                '$$brandProducts.products',
                                []
                              ]
                            }
                          }
                        ]
                      },
                      0
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }
  ]);

  const response = {
    status: 'success',
    productCategories: productCategories.map(cat => ({
      id: cat._id,
      name: cat.name,
      image: cat.image
    })),
    brandsAndProducts: brandsData,
    pageInfo: {
      page,
      limit,
      totalPages: Math.ceil(totalProductCategories / limit),
      totalItems: totalProductCategories
    }
  };

  res.status(200).json(response);
});

// Add a function to clear the cache when product categories are updated
const clearProductCategoriesCache = () => {
  productCategoryCache.del('allProductCategories');
  productCategoryCache.del('totalProductCategories');
};

module.exports = {
  homePageData,
  clearProductCategoriesCache
};
