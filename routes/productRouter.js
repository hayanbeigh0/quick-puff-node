const express = require('express');

const authController = require('../controllers/authController');
const productController = require('../controllers/productController');

const router = express.Router();

router
  .route('/')
  .post(
    authController.protect, // Ensure the user is authenticated
    productController.uploadMiddleware, // Handle file upload
    productController.createProduct, // Create the product
  )
  .get(authController.protect, productController.getProducts)
  .patch(
    authController.protect,
    productController.uploadMiddleware,
    productController.updateProduct,
  );
router
  .route('/:productId')
  .delete(authController.protect, productController.deleteProduct);

module.exports = router;
