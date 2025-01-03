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
    const productsLimit = parseInt(req.query.productsLimit, 10) || 20;

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
            quantity: '$productsForBrand.quantity',
            stock: '$productsForBrand.stock',
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
              cond: {
                $and: [
                  { $ne: ['$$product.id', null] }, // Only include valid products
                  { $ne: [{ $type: '$$product' }, 'missing'] }, // Exclude missing values
                ],
              },
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
          name: 1, // Sort brands by name (or any other consistent field)
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
          .filter((product) => product && Object.keys(product).length > 0) // Ensure products are not empty
          .sort((a, b) => a.name.localeCompare(b.name)) // Sort products consistently
          .slice(0, productsLimit); // Limit the number of products

        const totalProducts = brand.products.length;
        const remainingItems =
          totalProducts - productsLimit > 0 ? totalProducts - productsLimit : 0;

        return {
          id: brand.id,
          name: brand.name,
          products: sortedProducts.map((product) => ({
            id: product.id,
            name: product.name,
            image: product.image,
            price: product.price,
            quantity: product.quantity,
            stock: product.stock,
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

    await cacheService.save(cacheKey, response, 600);

    // Final response
    return res.status(200).json({ status: 'success', ...response, pageInfo });
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

const getTotalProductsCountByBrandAndCategory = catchAsync(
  async (req, res, next) => {
    const { brandId, productCategoryId } = req.params;

    // Extract filters from query params
    const {
      deals, // Boolean for deals
      available, // Boolean for availability
      flavor, // Flavor ObjectId
      maxQuantityValue, // Maximum quantity value
      maxQuantityUnit, // Maximum quantity unit
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

    if (maxQuantityValue && maxQuantityUnit) {
      matchFilters['quantity.value'] = { $lte: parseInt(maxQuantityValue, 10) };
      matchFilters['quantity.unit'] = maxQuantityUnit.trim();
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

const getBrandsByProductCategory = catchAsync(async (req, res, next) => {
  const { productCategoryId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  const cacheKey = `brands-${productCategoryId}-page-${page}-limit-${limit}`;

  // Try to get the cached response
  let cachedResponse;
  // const cachedResponse = await cacheService.getItem(cacheKey);
  if (cachedResponse) {
    return res.status(200).json(cachedResponse);
  }

  const productCategoryIdObj = mongoose.Types.ObjectId(productCategoryId);

  // Fetch paginated brands based on product category
  const brands = await ProductCategory.aggregate([
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
      $group: {
        _id: '$brandsSellingCategory._id',
        name: { $first: '$brandsSellingCategory.name' },
      },
    },
    {
      $sort: { name: 1 }, // Sort by brand name
    },
    {
      $skip: (page - 1) * limit,
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 1,
        name: 1,
      },
    },
  ]);

  const totalBrands = await ProductCategory.aggregate([
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
      $group: {
        _id: null,
        total: { $sum: 1 },
      },
    },
  ]);

  const totalItems = totalBrands.length > 0 ? totalBrands[0].total : 0;

  const pageInfo = {
    page,
    limit,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
  };

  const response = {
    brands: brands.map((brand) => ({
      id: brand._id,
      name: brand.name,
    })),
    pageInfo,
  };

  await cacheService.save(cacheKey, response, 600);

  // Final response
  return res.status(200).json({ status: 'success', ...response });
});

module.exports = {
  getBrandsAndProductsByBrandCategory,
  getProductsByBrandAndCategory,
  getTotalProductsCountByBrandAndCategory,
  getBrandsByProductCategory,
};
