const mongoose = require('mongoose');
const Product = require('../models/productModel');
const Brand = require('../models/brandModel');
const BrandCategory = require('../models/brandCategoryModel');
const ProductCategory = require('../models/productCategoryModel');

const cleanupInvalidProducts = async () => {
  try {
    console.log('Starting cleanup of invalid products...');
    
    // Get all products with their brand and product category
    const products = await Product.find()
      .select('_id name brand productCategory')
      .lean();

    console.log(`Found ${products.length} total products to validate`);
    
    const invalidProducts = [];

    // Validate each product
    for (const product of products) {
      // Get the brand with its categories
      const brand = await Brand.findById(product.brand)
        .select('categories')
        .lean();

      if (!brand) {
        invalidProducts.push({
          productId: product._id,
          reason: 'Brand not found',
          name: product.name
        });
        continue;
      }

      // Get all brand categories for this brand
      const brandCategories = await BrandCategory.find({
        _id: { $in: brand.categories }
      })
        .select('productCategories')
        .lean();

      // Get all product categories associated with these brand categories
      const validProductCategories = brandCategories.reduce((acc, bc) => {
        return acc.concat(bc.productCategories.map(pc => pc.toString()));
      }, []);

      // Check if the product's category is in the valid categories
      if (!validProductCategories.includes(product.productCategory.toString())) {
        invalidProducts.push({
          productId: product._id,
          reason: 'Invalid product category for brand',
          name: product.name
        });
      }
    }

    console.log(`Found ${invalidProducts.length} invalid products`);

    if (invalidProducts.length > 0) {
      console.log('\nInvalid products:');
      invalidProducts.forEach(p => {
        console.log(`- ${p.name} (${p.productId}): ${p.reason}`);
      });

      // Delete invalid products
      const invalidProductIds = invalidProducts.map(p => p.productId);
      const deleteResult = await Product.deleteMany({
        _id: { $in: invalidProductIds }
      });

      console.log(`\nDeleted ${deleteResult.deletedCount} invalid products`);
    } else {
      console.log('No invalid products found');
    }

  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

// Export the function if you want to run it from another file
module.exports = cleanupInvalidProducts;

// If running directly
if (require.main === module) {
  // Connect to your MongoDB (replace with your connection string)
  mongoose.connect(process.env.DATABASE_URL)
    .then(() => {
      console.log('Connected to database');
      return cleanupInvalidProducts();
    })
    .then(() => {
      console.log('Cleanup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
} 