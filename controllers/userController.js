const User = require('../models/userModel');

const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

const updateProfile = catchAsync(async (req, res, next) => {
  const { firstName, lastName, dateOfBirth, phoneNumber } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) return next(new AppError('No user found with that id', 400));

  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (dateOfBirth) user.dateOfBirth = dateOfBirth;
  if (phoneNumber) user.phoneNumber = phoneNumber;

  const updatedUser = await user.save();

  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser,
    },
  });
});

const addDeliveryAddressLocations = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  if (!user) return next(new AppError('No user found with that id', 400));

  if (req.body) user.deliveryAddressLocations.push(req.body);

  const updatedUser = await user.save();

  res.status(200).json({
    status: 'success',
    data: {
      deliveryAddressLocations: updatedUser.deliveryAddressLocations,
    },
  });
});

const removeDeliveryAddressLocation = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError('No user found with that id', 400));
  }

  // Find the index of the delivery address location to remove
  const deliveryLocationId = req.params.deliveryLocationId; // Assuming location ID is passed in params
  const deliverylocationIndex = user.deliveryAddressLocations.findIndex(
    (deliveryLocation) =>
      deliveryLocation._id.toString() === deliveryLocationId,
  );

  if (deliverylocationIndex === -1) {
    return next(
      new AppError('No delivery address location found with that id', 404),
    );
  }

  // Remove the location from the array
  user.deliveryAddressLocations.splice(deliverylocationIndex, 1);

  const updatedUser = await user.save();

  res.status(200).json({
    status: 'success',
    data: {
      deliveryAddressLocations: user.deliveryAddressLocations,
    },
  });
});

const getDeliveryAddressLocations = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select(
    'deliveryAddressLocations',
  );

  if (!user) return next(new AppError('No user found with that id', 400));

  res.status(200).json({
    status: 'success',
    data: {
      deliveryAddressLocations: user.deliveryAddressLocations,
    },
  });
});

const setDefaultDeliveryAddressLocations = catchAsync(
  async (req, res, next) => {
    const user = await User.findByIdAndUpdate(req.user._id);

    if (!user) return next(new AppError('No user found with that id', 400));

    const { deliveryLocationId } = req.params;

    // Find the address location with the matching ID
    const addressToUpdate = user.deliveryAddressLocations.find(
      (location) => location._id.toString() === deliveryLocationId,
    );

    if (!addressToUpdate) {
      return next(new AppError('Delivery address location not found', 404));
    }

    // Set default to true for the selected address and false for others
    user.deliveryAddressLocations.forEach((location) => {
      location.default = location._id.toString() === deliveryLocationId;
    });

    await user.save();

    res.status(200).json({
      status: 'success',
      data: {
        deliveryAddressLocations: user.deliveryAddressLocations,
      },
    });
  },
);

const updateDeliveryAddressLocation = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  if (!user) return next(new AppError('No user found with that id', 400));

  const deliveryLocationId = req.params.deliveryLocationId;
  const updatedLocation = req.body;

  if (!deliveryLocationId || !updatedLocation) {
    return next(new AppError('Location ID and updated data are required', 400));
  }

  const locationIndex = user.deliveryAddressLocations.findIndex(
    (location) => location._id.toString() === deliveryLocationId,
  );

  if (locationIndex === -1) {
    return next(new AppError('No delivery address found with that ID', 404));
  }

  // Update the specific fields in the location
  Object.assign(user.deliveryAddressLocations[locationIndex], updatedLocation);

  const updatedUser = await user.save();

  res.status(200).json({
    status: 'success',
    data: {
      deliveryAddressLocations: updatedUser.deliveryAddressLocations,
    },
  });
});

module.exports = {
  updateProfile,
  addDeliveryAddressLocations,
  getDeliveryAddressLocations,
  removeDeliveryAddressLocation,
  setDefaultDeliveryAddressLocations,
  updateDeliveryAddressLocation,
};
