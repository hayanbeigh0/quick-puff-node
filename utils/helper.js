const User = require("../models/userModel");
const Vehicle = require("../models/vehicleModel");
const AppError = require("./appError");
const catchAsync = require("./catchAsync");

exports.updateVehiclesAndUser = async (
  doc,
  userId,
  userRole,
  vehicleIds,
  session
) => {
  let updateObj = {};
  console.log(doc);
  if (doc._id) {
    updateObj = {
      $addToSet: { organisations: doc._id },
    };
    if (vehicleIds) {
      Object.assign(updateObj.$addToSet, {
        vehicles: { $each: vehicleIds },
      });

      const vehicleOrganisationUpdateObj = {
        $set: { organisation: doc._id },
      };
      const vehicles = await Vehicle.updateMany(
        { _id: { $in: vehicleIds } },
        vehicleOrganisationUpdateObj,
        { session }
      );

      // This needs to be thought that how do we not update the organisations of invalid vehicle id's.
      // if (vehicles.nModified !== vehicleIds.length) {
      //   throw new Error("Invalid vehicle Id!");
      // }
    }
  }
  const user = await User.findByIdAndUpdate(
    userId,
    { ...updateObj, role: userRole },
    { session }
  );

  if (!user) {
    throw new Error("User not found!");
  }

  return user;
};

exports.checkUserOrganisation = catchAsync(async (req, res, next) => {
  console.log("user", req.user);
  const vehicleOrganisation = req.body.organisation;
  console.log("vehicle org", vehicleOrganisation);
  if (vehicleOrganisation) {
    const user = req.user;
    if (user) {
      if (
        user.organisations !== 0 &&
        !user.organisations.includes(vehicleOrganisation)
      ) {
        console.log(user.organisations, vehicleOrganisation);
        next(
          new AppError(
            "You are not authorised to add/update the vehicle outside your organisation!",
            401
          )
        );
      }
    }
  }
  next();
});

exports.checkVehicleAssociation = catchAsync(async (req, res, next) => {
  console.log("user", req.user);
  const vehicleIds = req.body.vehicles || null;
  if (vehicleIds) {
    const user = req.user;
    if (user) {
      const vehicleDocCount = await Vehicle.countDocuments({
        _id: { $in: vehicleIds },
        organisation: { $exists: true },
      });
      console.log(vehicleDocCount);
      // if (vehicleDocCount != vehicleIds.length) {
      //   next(new AppError("One or more vehicle Id's are invalid!", 400));
      // }
      if (vehicleDocCount > 0) {
        next(
          new AppError(
            "One or more vehicles are already associated with an organisation!",
            400
          )
        );
      }
    }
  }
  next();
});
