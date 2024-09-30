const Advertisement = require('../models/advertisementModel'); // Import the Advertisement model
const factory = require('./handlerFactory');

// Use the factory to create CRUD operations for Advertisement
const createAdvertisement = factory.createOne(Advertisement);
const updateAdvertisement = factory.updateOne(Advertisement);
const getAdvertisements = factory.getAll(Advertisement);
const getAdvertisement = factory.getOne(Advertisement);
const deleteAdvertisement = factory.deleteOne(Advertisement);

module.exports = {
  createAdvertisement,
  updateAdvertisement,
  getAdvertisements,
  getAdvertisement,
  deleteAdvertisement,
};
