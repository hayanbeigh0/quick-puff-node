const Flavor = require('../models/flavorModel');
const factory = require('./handlerFactory');

const createFlavor = factory.createOne(Flavor);
const updateFlavor = factory.updateOne(Flavor);
const getFlavors = factory.getAll(Flavor);
const getFlavor = factory.getOne(Flavor);
const deleteFlavor = factory.deleteOne(Flavor);

module.exports = {
  createFlavor,
  updateFlavor,
  getFlavor,
  getFlavors,
  deleteFlavor,
};
