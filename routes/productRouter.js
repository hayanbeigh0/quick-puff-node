const express = require('express');

const authController = require('../controllers/authController');
const productController = require('../controllers/productController');
const fileUploadController = require('../controllers/fileUploadController');

const router = express.Router();

// Get popular products - put this before dynamic routes to avoid conflict
router.route('/popular').get(productController.getPopularProducts);

// Search products and get suggestions
router
  .route('/search')
  .get(authController.getUser, productController.searchProducts);

router.route('/search/suggestions').get(productController.getSearchSuggestions);

// Create and get all products
router
  .route('/')
  .post(
    authController.protect,
    fileUploadController.handleFileUpload,
    productController.validateProductData,
    productController.createProduct,
  )
  .get(productController.getProducts)
  .patch(
    authController.protect,
    fileUploadController.handleFileUpload,
    productController.validateProductData,
    productController.updateProduct,
  );

// Get products with filters (based on brandId and categoryId)
router
  .route('/filters/:brandId/:categoryId')
  .get(productController.getProductFilter);

// Dynamic route for individual product
router
  .route('/:productId')
  .get(productController.getProduct)
  .delete(authController.protect, productController.deleteProduct);

router.route('/:productId/price').get(productController.getProductPrice);

module.exports = router;
