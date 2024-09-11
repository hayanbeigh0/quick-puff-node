const express = require('express');

const authController = require('../controllers/authController');
const productController = require('../controllers/productController');
const fileUploadController = require('../controllers/fileUploadController');

const router = express.Router();

router
  .route('/')
  .post(
    authController.protect, // Ensure the user is authenticated
    fileUploadController.handleFileUpload, // Handle file upload
    productController.createProduct, // Create the product
  )
  .get(authController.protect, productController.getProducts)
  .patch(
    authController.protect,
    fileUploadController.handleFileUpload,
    productController.updateProduct,
  );
router
  .route('/:productId')
  .delete(authController.protect, productController.deleteProduct);
router
  .route('/search')
  .get(authController.protect, productController.searchProducts);
router
  .route('/search/suggestions')
  .get(authController.protect, productController.getSearchSuggestions);
router
  .route('/popularProducts')
  .get(authController.protect, productController.getPopularProducts);

module.exports = router;
