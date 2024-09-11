const express = require('express');

const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const fileUploadController = require('../controllers/fileUploadController');

const router = express.Router();

router.route('/').patch(authController.protect, userController.updateProfile);
router
  .route('/myDeliveryAddressLocations')
  .post(authController.protect, userController.addDeliveryAddressLocations)
  .get(authController.protect, userController.getDeliveryAddressLocations)
  .patch(authController.protect, userController.updateDeliveryAddressLocation);

router
  .route('/myDeliveryAddressLocations/active')
  .get(
    authController.protect,
    userController.getActiveDeliveryAddressLocationOfUser,
  );

router
  .route('/myDeliveryAddressLocations/:deliveryLocationId')
  .delete(authController.protect, userController.removeDeliveryAddressLocation);

router
  .route('/setDefaultDeliveryAddressLocation/:deliveryLocationId')
  .post(
    authController.protect,
    userController.setDefaultDeliveryAddressLocations,
  );

router
  .route('/photoId')
  .post(
    authController.protect,
    fileUploadController.handleFileUpload,
    userController.uploadPhotoId,
  );

module.exports = router;
