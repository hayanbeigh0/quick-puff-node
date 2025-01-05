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
    const productsLimit = parseInt(req.query.productsLimit, 10) || 20;

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

  // Find brands that have this product category
  const brands = await Brand.find({
    categories: { $in: [productCategoryId] }
  })
    .select('name image _id')
    .lean();

  // Get products for each brand in this category
  const brandsWithProducts = await Promise.all(
    brands.map(async (brand) => {
      const products = await Product.find({
        brand: brand._id,
        productCategory: productCategoryId
      })
        .select('name image price _id stock quantity')
        .limit(productsLimit)
        .lean();

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

  const totalBrands = await Brand.countDocuments({
    categories: productCategoryId
  });

  // Format the response to match the previous structure
  const response = {
    status: 'success',
    brandCategoryName: productCategory.name,
    brands: brands.map(brand => ({
      name: brand.name,
      image: brand.image,
      id: brand._id
    })),
    brandsAndProducts: brandsWithProducts,
    pageInfo: {
      page,
      limit,
      totalPages: Math.ceil(totalBrands / limit),
      totalItems: totalBrands
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
    .select('name _id')
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
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const products = await Product.find({
    brand: brandId,
    productCategory: productCategoryId
  })
    .select('name image price _id stock')
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const totalProducts = await Product.countDocuments({
    brand: brandId,
    productCategory: productCategoryId
  });

  res.status(200).json({
    status: 'success',
    results: products.length,
    products,
    pageInfo: {
      page,
      limit,
      totalPages: Math.ceil(totalProducts / limit),
      totalItems: totalProducts
    }
  });
});

/**
 * Get total products count by brand and category
 */
const getTotalProductsCountByBrandAndCategory = catchAsync(async (req, res, next) => {
    const { brandId, productCategoryId } = req.params;

  const totalProducts = await Product.countDocuments({
    brand: brandId,
    productCategory: productCategoryId
  });

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
