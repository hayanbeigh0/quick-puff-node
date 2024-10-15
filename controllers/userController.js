const User = require('../models/userModel');

const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { uploadImage, getImageUrl } = require('../utils/cloudfs');

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

const getActiveDeliveryAddressLocationOfUser = catchAsync(
  async (req, res, next) => {
    // Find the user by ID
    const user = await User.findById(req.user._id);

    if (!user) {
      return next(new AppError('No user found with that ID', 400));
    }

    // Find the active (default) delivery address
    const activeDeliveryAddress = user.deliveryAddressLocations.find(
      (address) => address.default === true,
    );

    if (!activeDeliveryAddress) {
      return next(new AppError('No default delivery address found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        deliveryAddressLocation: activeDeliveryAddress,
      },
    });
  },
);

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

  const updatedLocation = req.body;

  if (!updatedLocation || !updatedLocation.id) {
    return next(new AppError('Location ID and updated data are required', 400));
  }

  const locationIndex = user.deliveryAddressLocations.findIndex(
    (location) => location._id.toString() === updatedLocation.id,
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

const uploadPhotoId = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError('No user found with that id', 400));
  }

  // Upload the image to Cloudinary
  const publicId = await uploadImage(req.file, 'photoIDs');

  const assetInfo = getImageUrl(publicId);
  user.photoIdUrl = assetInfo;
  user.idVerificationStatus = 'initiated';

  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Photo ID uploaded, awaiting admin verification',
  });
});

const getPendingVerifications = catchAsync(async (req, res, next) => {
  const pendingUsers = await User.find({
    idVerificationStatus: 'initiated',
  }).select('firstName lastName email photoIdUrl dateOfBirth');

  res.status(200).json({
    status: 'success',
    data: {
      pendingUsers,
    },
  });
});

const verifyOrRejectPhotoId = catchAsync(async (req, res, next) => {
  const { userId, action, comment } = req.body;
  const user = await User.findById(userId);

  if (!user) {
    return next(new AppError('No user found with that id', 400));
  }

  if (!['verify', 'reject'].includes(action)) {
    return next(new AppError('Invalid action', 400));
  }

  user.idVerificationStatus = action === 'verify' ? 'verified' : 'rejected';
  user.idVerified = true;
  user.idVerifiedBy = req.user._id;
  user.idVerificationDate = Date.now();
  user.idVerificationComment = comment || '';

  await user.save();

  res.status(200).json({
    status: 'success',
    message: `User photo ID has been ${user.idVerificationStatus}`,
    data: {
      user,
    },
  });
});

const getCurrentUser = catchAsync(async (req, res, next) => {
  // `req.user` should already contain the authenticated user's data
  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user,
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
  getActiveDeliveryAddressLocationOfUser,
  uploadPhotoId,
  getPendingVerifications,
  verifyOrRejectPhotoId,
  getCurrentUser,
};
