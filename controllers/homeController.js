const ProductCategory = require('../models/productCategoryModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { cacheInstances, CACHE_KEYS } = require('../utils/cacheManager');
const { productCategoryCache } = cacheInstances;

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

  // Get all product categories first (limited to 6)
  const productCategories = await ProductCategory.find()
    .select('name image')
    .sort({ name: 1 })
    .limit(6)
    .lean()
    .then(categories => categories.map(cat => ({
      name: cat.name,
      image: cat.image,
      id: cat._id
    })));

  // Get brands and products for the same categories
  const brandsData = await ProductCategory.aggregate([
    // Match only the categories we got above
    {
      $match: {
        _id: { $in: productCategories.map(cat => cat.id) }
      }
    },
    // Sort to maintain same order
    {
      $sort: { name: 1 }
    },
    // Apply pagination
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
        let: { 
          categoryId: '$_id',
          categoryName: '$name'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$productCategory', '$$categoryId']
              }
            }
          },
          {
            $addFields: {
              productCategory: '$$categoryName',
              productCategoryId: '$$categoryId'
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
                  id: '$_id',
                  name: '$name',
                  image: '$image',
                  price: '$price',
                  quantity: '$quantity',
                  stock: '$stock',
                  productCategory: '$productCategory',
                  productCategoryId: '$productCategoryId'
                }
              }
            }
          },
          {
            $project: {
              products: { $slice: ['$products', 0, limit] }
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
              count: { $sum: 1 }
            }
          }
        ],
        as: 'brandProductCounts'
      }
    },
    // Filter brands to only those with products
    {
      $addFields: {
        brands: {
          $filter: {
            input: '$brands',
            as: 'brand',
            cond: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: '$brandProductCounts',
                      as: 'count',
                      cond: { $eq: ['$$count._id', '$$brand._id'] }
                    }
                  }
                },
                0
              ]
            }
          }
        }
      }
    },
    // Format the output
    {
      $project: {
        _id: 0,
        id: '$_id',
        brandCategoryName: { $concat: ['$name', ' brands'] },
        brands: {
          $map: {
            input: '$brands',
            as: 'brand',
            in: {
              name: '$$brand.name',
              image: '$$brand.image',
              id: '$$brand._id'
            }
          }
        },
        brandCategoryProducts: {
          $map: {
            input: '$brands',
            as: 'brand',
            in: {
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
              },
              productCategory: '$name',
              productCategoryId: '$_id'
            }
          }
        }
      }
    },
    // Add this new stage to filter out empty results
    {
      $match: {
        $and: [
          { 'brands.0': { $exists: true } },  // Only include if brands array is not empty
          { 'brandCategoryProducts.0': { $exists: true } }  // Only include if brandCategoryProducts array is not empty
        ]
      }
    }
  ]);

  // Get total count for pagination
  const totalProductCategories = productCategories.length;

  const response = {
    status: 'success',
    productCategories,
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
