const BrandCategory = require('../models/brandCategoryModel');
const Brand = require('../models/brandModel');
const ProductCategory = require('../models/productCategoryModel');
const Product = require('../models/productModel');
const AppError = require('../utils/appError');
const factory = require('./handlerFactory');
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');

/**
 * Controller function to fetch and structure homepage data using an aggregation pipeline.
 * The data includes product categories, brand categories, brands, and products.
 */
const homePageData = catchAsync(async (req, res, next) => {
  // 1. Fetch the product categories
  const productCategories =
    await ProductCategory.find().select('name image _id');

  // 2. Use aggregation pipeline to fetch brand categories, brands, and products in a single query
  const brandsData = await BrandCategory.aggregate([
    // Lookup brands that are associated with each brand category
    {
      $lookup: {
        from: 'brands', // The name of the collection for Brand
        localField: '_id', // The _id field in BrandCategory
        foreignField: 'categories', // The categories field in Brand
        as: 'brands', // The name of the output array
      },
    },
    // Lookup products that are associated with each product category under the brand category
    {
      $lookup: {
        from: 'products', // The name of the collection for Product
        let: { productCategoryIds: '$productCategories' }, // Pass the productCategories _id
        pipeline: [
          {
            $match: {
              $expr: { $in: ['$productCategory', '$$productCategoryIds'] }, // Match products by productCategory
            },
          },
          {
            $project: {
              name: 1,
              image: 1,
            },
          },
        ],
        as: 'brandCategoryProducts', // The name of the output array
      },
    },
    // Project only the required fields
    {
      $project: {
        brandCategoryName: '$name', // Rename 'name' to 'brandCategoryName'
        brands: {
          name: 1,
          image: 1,
        },
        brandCategoryProducts: 1, // Include the products
      },
    },
  ]);

  // 3. Create the final response structure
  const response = {
    status: 'success',
    productCategories: productCategories,
    brandsAndProducts: brandsData,
  };

  // 4. Send the response back to the client
  res.status(200).json(response);
});

module.exports = {
  homePageData,
};
