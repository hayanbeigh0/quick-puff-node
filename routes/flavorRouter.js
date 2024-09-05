const express = require('express');

const authController = require('../controllers/authController');
const flavorController = require('../controllers/flavorController');

const router = express.Router();

router
  .route('/')
  .post(
    authController.protect, // Ensure the user is authenticated
    flavorController.createFlavor, // Create the product
  )
  .get(authController.protect, flavorController.getFlavors);
router
  .route('/:id')
  .get(
    authController.protect, // Ensure the user is authenticated
    flavorController.getFlavor, // Create the product
  )
  .patch(authController.protect, flavorController.updateFlavor)
  .delete(authController.protect, flavorController.deleteFlavor);

module.exports = router;
