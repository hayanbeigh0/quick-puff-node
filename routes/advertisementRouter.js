const express = require('express');

const authController = require('../controllers/authController');
const advertisementController = require('../controllers/advertisementController');

const router = express.Router();

router
  .route('/')
  .post(authController.protect, advertisementController.createAdvertisement)
  .get(advertisementController.getAdvertisements);

router
  .route('/:id')
  .get(advertisementController.getAdvertisement)
  .patch(authController.protect, advertisementController.updateAdvertisement)
  .delete(authController.protect, advertisementController.deleteAdvertisement);
router
  .route('/category/:categoryId')
  .get(advertisementController.getAdvertisementBasedOnProductCategory);

module.exports = router;
