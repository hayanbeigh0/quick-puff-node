const express = require('express');

const serviceableLocationController = require('../controllers/serviceableLocationController');

const router = express.Router();

router
  .route('/')
  .post(serviceableLocationController.createServiceableLocation)
  .get(serviceableLocationController.getServiceableLocations);

router
  .route('/:serviceableLocationId')
  .delete(serviceableLocationController.deleteServiceableLocation);

router
  .route('/checkIfServiceableLocation')
  .get(serviceableLocationController.checkIfServiceableLocation);

module.exports = router;