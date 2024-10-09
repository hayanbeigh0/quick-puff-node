const express = require('express');
const fulfillmentCenterController = require('../controllers/fulfillmentCenterController');

const router = express.Router();

router
  .route('/')
  .post(fulfillmentCenterController.createFulfillmentCenter) // Create a new fulfillment center
  .get(fulfillmentCenterController.getFulfillmentCenters); // Get all fulfillment centers

router
  .route('/:id')
  .get(fulfillmentCenterController.getFulfillmentCenter) // Get a specific fulfillment center by ID
  .patch(fulfillmentCenterController.updateFulfillmentCenter) // Update a fulfillment center
  .delete(fulfillmentCenterController.deleteFulfillmentCenter); // Delete a fulfillment center

module.exports = router;
