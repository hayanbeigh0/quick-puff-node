const express = require('express');

const authController = require('../controllers/authController');
const productController = require('../controllers/productController');
const fileUploadController = require('../controllers/fileUploadController');

const router = express.Router();

router.route('/').post(
  authController.protect, // Ensure the user is authenticated
  fileUploadController.handleFileUpload, // Handle file upload
  productController.createProduct, // Create the product
);

module.exports = router;
