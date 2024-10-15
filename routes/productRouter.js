const express = require('express');

const authController = require('../controllers/authController');
const productController = require('../controllers/productController');
const fileUploadController = require('../controllers/fileUploadController');

const router = express.Router();

// Get popular products - put this before dynamic routes to avoid conflict
router
  .route('/popular')
  .get(authController.protect, productController.getPopularProducts);

// Search products and get suggestions
router
  .route('/search')
  .get(authController.protect, productController.searchProducts);

router
  .route('/search/suggestions')
  .get(authController.protect, productController.getSearchSuggestions);

// Create and get all products
router
  .route('/')
  .post(
    authController.protect,
    fileUploadController.handleFileUpload,
    productController.createProduct,
  )
  .get(authController.protect, productController.getProducts)
  .patch(
    authController.protect,
    fileUploadController.handleFileUpload,
    productController.updateProduct,
  );

// Get products with filters (based on brandId and categoryId)
router
  .route('/filters/:brandId/:categoryId')
  .get(authController.protect, productController.getProductFilter);

// Dynamic route for individual product
router
  .route('/:productId')
  .get(productController.getProduct)
  .delete(authController.protect, productController.deleteProduct);

router
  .route('/:productId/price')
  .get(authController.protect, productController.getProductPrice);

module.exports = router;
