const BrandCategory = require('../models/brandCategoryModel');
const ProductCategory = require('../models/productCategoryModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const NodeCache = require('node-cache');
const productCategoryCache = new NodeCache({ stdTTL: 3600 });

/**
 * Controller function to fetch and structure homepage data using an aggregation pipeline.
 * The data includes product categories, brand categories, brands, and products.
 */
const homePageData = catchAsync(async (req, res, next) => {
  // Extract pagination parameters from query string
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1
  const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 items per page

  // Ensure page and limit are positive integers
  if (page < 1 || limit < 1) {
    return next(new AppError('Page and limit must be positive integers', 400));
  }

  // Check if data is in cache
  let productCategories = productCategoryCache.get('productCategories');

  if (!productCategories) {
    // Fetch from database if not in cache
    productCategories = await ProductCategory.find()
      .select('name image _id')
      .lean();
    // Rename _id to id
    productCategories = productCategories.map((category) => ({
      ...category,
      id: category._id,
      _id: undefined, // Remove the _id field
    }));
    // Store data in cache
    productCategoryCache.set('productCategories', productCategories);
  }

  // 2. Use aggregation pipeline to fetch brand categories, brands, and products with pagination
  const brandsData = await BrandCategory.aggregate([
    {
      $lookup: {
        from: 'brands',
        localField: '_id',
        foreignField: 'categories',
        as: 'brands',
      },
    },
    {
      $lookup: {
        from: 'products',
        let: { productCategoryIds: '$productCategories' },
        pipeline: [
          {
            $match: {
              $expr: { $in: ['$productCategory', '$$productCategoryIds'] },
            },
          },
          {
            $project: {
              name: 1,
              image: 1,
            },
          },
        ],
        as: 'brandCategoryProducts',
      },
    },
    {
      $addFields: {
        id: '$_id', // Add a new field `id` with the value of `_id`
      },
    },
    {
      $project: {
        _id: 0, // Exclude `_id` from the result
        id: 1, // Include `id` in the result
        brandCategoryName: '$name',
        brands: {
          name: 1,
          image: 1,
        },
        brandCategoryProducts: 1,
      },
    },
    {
      $skip: (page - 1) * limit, // Skip the documents for the current page
    },
    {
      $limit: limit, // Limit the number of documents per page
    },
  ]);

  // 3. Get the total count of brand categories
  const totalBrandCategories = await BrandCategory.countDocuments();

  // 4. Create the final response structure
  const response = {
    status: 'success',
    productCategories,
    brandsAndProducts: brandsData,
    pageInfo: {
      page,
      limit,
      totalPages: Math.ceil(totalBrandCategories / limit),
      totalItems: totalBrandCategories,
    },
  };

  // 5. Send the response back to the client
  res.status(200).json(response);
});

module.exports = {
  homePageData,
};
