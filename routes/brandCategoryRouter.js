const express = require('express');

const authController = require('../controllers/authController');
const brandCategoryController = require('../controllers/brandCategoryController');

const router = express.Router();

router
  .route('/')
  .post(
    authController.protect, // Ensure the user is authenticated
    brandCategoryController.createBrandCategory, // Create the brand
  )
  .get(brandCategoryController.getBrandCategories)
  .patch(authController.protect, brandCategoryController.updateBrandCategory);
router
  .route('/:categoryId')
  .delete(authController.protect, brandCategoryController.deleteBrandCategory);

module.exports = router;
