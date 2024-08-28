const express = require('express');

const authController = require('../controllers/authController');
const userController = require('../controllers/userController');

const router = express.Router();

router.route('/').patch(authController.protect, userController.updateProfile);
router
  .route('/myDeliveryAddressLocations')
  .post(authController.protect, userController.addDeliveryAddressLocations)
  .get(authController.protect, userController.getDeliveryAddressLocations);

router
  .route('/myDeliveryAddressLocations/:deliveryLocationId')
  .delete(authController.protect, userController.removeDeliveryAddressLocation);

module.exports = router;