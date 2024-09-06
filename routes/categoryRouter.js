const express = require('express');

const authController = require('../controllers/authController');
const categoryController = require('../controllers/categoryController');

const router = express.Router();

router.route('/:productCategoryId').get(
  authController.protect, // Ensure the user is authenticated
  categoryController.getBrandsAndProductsByBrandCategory, // Create the product
);
router.route('/:brandId/:productCategoryId').get(
  authController.protect, // Ensure the user is authenticated
  categoryController.getProductsByBrandAndCategory, // Create the product
);
router.route('/:brandId/:productCategoryId/count').get(
  authController.protect, // Ensure the user is authenticated
  categoryController.getTotalProductsCountByBrandAndCategory, // Create the product
);

module.exports = router;
