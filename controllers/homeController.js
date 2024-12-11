const BrandCategory = require('../models/brandCategoryModel');
const ProductCategory = require('../models/productCategoryModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const NodeCache = require('node-cache');
const productCategoryCache = new NodeCache({ stdTTL: 3600 });

/**
 * Controller function to fetch and structure homepage data using an aggregation pipeline.
 * The data includes product categories, brand categories, brands, and products.
 * Aggregation Pipeline for Brands and Products:

    The pipeline performs the following operations:
    $lookup for Brands: Joins the brands collection with the BrandCategory based on the category ID. 
    The pipeline inside the $lookup projects each brand's _id as id and excludes the original _id.
    $lookup for Products: Joins the products collection with the BrandCategory based on product category IDs.
     A facet is used to limit the products to 10 and count the total number of products.
    Remaining Items Calculation: Calculates the number of remaining items by subtracting 10 
    (the number of products retrieved) from the total product count.
    $addFields and $project: Fields like id, brandCategoryName, brands, and brandCategoryProducts are added to the 
    final output, and unnecessary fields like _id are excluded.
 */

const homePageData = catchAsync(async (req, res, next) => {
  // Extract pagination parameters from query string
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1
  const limit = parseInt(req.query.limit, 10) || 2; // Default to 10 items per page

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
      .limit(6)
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
        pipeline: [
          {
            $project: {
              id: '$_id', // Create `id` from `_id`
              name: 1,
              image: 1,
              _id: 0, // Exclude `_id`
            },
          },
        ],
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
            $lookup: {
              from: 'productcategories', // Lookup for product category information
              localField: 'productCategory',
              foreignField: '_id',
              as: 'productCategoryInfo',
            },
          },
          {
            $unwind: '$productCategoryInfo', // Unwind the product category array
          },
          {
            $facet: {
              products: [
                { $limit: 10 }, // Fetch only 10 products
                {
                  $project: {
                    id: '$_id', // Create `id` from `_id`
                    name: 1,
                    image: 1,
                    price: 1,
                    quantity: 1,
                    volume: 1,
                    stock: 1,
                    productCategory: '$productCategoryInfo.name', // Include product category name
                    productCategoryId: '$productCategoryInfo._id', // Include product category id
                    _id: 0, // Exclude `_id`
                  },
                },
              ],
              totalCount: [{ $count: 'count' }], // Count total items
            },
          },
          {
            $addFields: {
              remainingItems: {
                $let: {
                  vars: {
                    totalItems: { $arrayElemAt: ['$totalCount.count', 0] },
                  },
                  in: { $max: [{ $subtract: ['$$totalItems', 10] }, 0] }, // Ensure non-negative remainingItems
                },
              },
              productCategory: { $first: '$products.productCategory' }, // Add category of products
              productCategoryId: { $first: '$products.productCategoryId' }, // Add product category id
            },
          },
          {
            $project: {
              totalCount: 0, // Exclude totalCount from the final output
            },
          },
        ],
        as: 'brandCategoryProducts',
      },
    },
    {
      $addFields: {
        id: '$_id', // Create `id` from `_id`
      },
    },
    {
      $project: {
        _id: 0, // Exclude `_id`
        id: 1, // Include `id`
        brandCategoryName: '$name',
        brands: 1,
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
