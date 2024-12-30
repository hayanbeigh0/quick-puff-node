const express = require('express');

const authController = require('../controllers/authController');
const brandController = require('../controllers/brandController');
const fileUploadController = require('../controllers/fileUploadController');

const router = express.Router();

router
  .route('/')
  .post(
    authController.protect, // Ensure the user is authenticated
    fileUploadController.handleFileUpload, // Handle file upload
    brandController.createBrand, // Create the brand
  )
  .get(brandController.getBrands)
  .patch(
    authController.protect,
    fileUploadController.handleFileUpload,
    brandController.updateBrand,
  );
router
  .route('/:brandId')
  .delete(authController.protect, brandController.deleteBrand);
router.get('/:brandId', brandController.getBrandById);

module.exports = router;
