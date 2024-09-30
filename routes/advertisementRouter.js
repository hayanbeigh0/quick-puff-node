const express = require('express');

const authController = require('../controllers/authController');
const advertisementController = require('../controllers/advertisementController');

const router = express.Router();

router.use(authController.protect);

router
  .route('/')
  .post(advertisementController.createAdvertisement)
  .get(advertisementController.getAdvertisements);

router
  .route('/:id')
  .get(advertisementController.getAdvertisement)
  .patch(advertisementController.updateAdvertisement)
  .delete(advertisementController.deleteAdvertisement);

module.exports = router;
