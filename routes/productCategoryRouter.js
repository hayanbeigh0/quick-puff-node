const express = require('express');

const authController = require('../controllers/authController');
const productCategoryController = require('../controllers/productCategoryController');
const fileUploadController = require('../controllers/fileUploadController');

const router = express.Router();

router
  .route('/')
  .post(
    authController.protect, // Ensure the user is authenticated
    fileUploadController.handleFileUpload, // Handle file upload
    productCategoryController.createProductCategory, // Create the product
  )
  .get(productCategoryController.getProductCategories)
  .patch(
    authController.protect,
    fileUploadController.handleFileUpload,
    productCategoryController.updateProductCategory,
  );
router
  .route('/:categoryId')
  .delete(
    authController.protect,
    productCategoryController.deleteProductCategory,
  );

module.exports = router;
