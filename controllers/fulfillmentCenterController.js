const FulfillmentCenter = require('../models/fulfillmentCenterModel');
const factory = require('./handlerFactory');

const createFulfillmentCenter = factory.createOne(FulfillmentCenter);
const updateFulfillmentCenter = factory.updateOne(FulfillmentCenter);
const getFulfillmentCenters = factory.getAll(FulfillmentCenter);
const getFulfillmentCenter = factory.getOne(FulfillmentCenter);
const deleteFulfillmentCenter = factory.deleteOne(FulfillmentCenter);

module.exports = {
  createFulfillmentCenter,
  updateFulfillmentCenter,
  getFulfillmentCenter,
  getFulfillmentCenters,
  deleteFulfillmentCenter,
};
