const express = require('express');

const authController = require('../controllers/authController');
const categoryController = require('../controllers/categoryController');

const router = express.Router();

router.route('/:productCategoryId').get(
  categoryController.getBrandsAndProductsByBrandCategory, // Create the product
);

router.route('/:productCategoryId/brands').get(
  categoryController.getBrandsByProductCategory, // Create the product
);

router.route('/:brandId/:productCategoryId').get(
  categoryController.getProductsByBrandAndCategory, // Create the product
);
router.route('/:brandId/:productCategoryId/count').get(
  categoryController.getTotalProductsCountByBrandAndCategory, // Create the product
);

module.exports = router;
