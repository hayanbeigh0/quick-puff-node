const ServiceableLocation = require('../models/serviceableLocation');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');

// Controller function to handle product creation
const createServiceableLocation = catchAsync(async (req, res, next) => {
  const serviceableLocation = await ServiceableLocation.create({
    zipCode: req.body.zipCode,
    countryCode: req.body.countryCode,
  });

  res.status(201).json({
    status: 'success',
    data: {
      serviceableLocation,
    },
  });
});

const deleteServiceableLocation = catchAsync(async (req, res, next) => {
  const { serviceableLocationId } = req.params;

  // Find the serviceableLocation by ID
  const serviceableLocation = await ServiceableLocation.findById(
    serviceableLocationId,
  );
  if (!serviceableLocation)
    return next(new AppError('serviceableLocation not found', 404));

  // Delete the serviceableLocation from the database
  await ServiceableLocation.findByIdAndDelete(serviceableLocationId);

  res.status(204).json({
    status: 'success',
    message: 'SServiceableLocation deleted successfully',
  });
});

const getServiceableLocations = factory.getAll(ServiceableLocation);

const checkIfServiceableLocation = catchAsync(async (req, res, next) => {
  const { zipCode, countryCode } = req.body;

  // Check if the zipCode exists in the ServiceableLocation collection
  // const serviceableLocation = await ServiceableLocation.findOne({ // Need to disable it temporarily
  //   zipCode,
  //   countryCode,
  // });

  // if (!serviceableLocation) {
  //   return res.status(404).json({
  //     status: 'fail',
  //     message: 'This location is not serviceable.',
  //   });
  // }

  res.status(200).json({
    status: 'success',
    message: 'This location is serviceable.',
  });
});

// Export middleware and controller functions
module.exports = {
  createServiceableLocation,
  deleteServiceableLocation,
  getServiceableLocations,
  checkIfServiceableLocation,
};
