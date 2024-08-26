const APIFeatures = require("../utils/apiFeatures");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const User = require("../models/userModel");
const mongoose = require("mongoose");
const Organisation = require("../models/organisationModel");
const setTransaction = require("./transactionController");
// const organisationController = require("./organisationController");
const Vehicle = require("../models/vehicleModel");
const helpers = require("../utils/helper");
const Notification = require("../models/notificationModel");

exports.fn = function () {
  console.log("this is the export functionx");
};

exports.deleteOne = (Model) => {
  // On each delete, if the references of the document also needs to be deleted,
  // then we will have to check if the document has a model/schema type which can have references of
  // its documents in the other models / schema's.
  return setTransaction(async (req, res, next, session) => {
    if (Model === Organisation) {
      // Here we know that the document of the Organisation model/schema can have references in the User model/schema also.
      await User.updateMany(
        {},
        { $pull: { organisations: req.params.id } },
        { session }
      );
      await Vehicle.updateMany(
        { organisation: req.params.id },
        { $unset: { organisation: "" } },
        { session }
      );
    }
    if (Model === Vehicle) {
      // Here we know that the document of the Vehicle model/schema can have references in the User model/schema also.
      await User.updateMany(
        {},
        { $pull: { vehicles: req.params.id } },
        { session }
      );
      await Organisation.updateMany(
        {},
        { $pull: { vehicles: req.params.id } },
        { session }
      );
    }
    if (Model === User) {
      // Here we know that the document of the User model/schema can have references in the User model/schema also.
      await Vehicle.updateMany(
        {},
        { $pull: { users: req.params.id } },
        { session }
      );
      await Organisation.updateMany(
        {},
        { $pull: { users: req.params.id } },
        { session }
      );
    }
    const doc = await Model.findByIdAndDelete(req.params.id, { session });
    if (!doc) {
      throw new Error("No document found with that ID");
    }
    res.status(204).json({
      data: null,
    });
  });
};

exports.updateOne = (Model) =>
  setTransaction(async (req, res, next, session) => {
    console.log(req.params.id);

    // Check if the model is Vehicle and remove the users property if it exists
    if (Model === Vehicle && req.body.users) {
      delete req.body.users;
    }

    // Update the document
    let query = Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    // Populate the driver field if the model is Vehicle
    if (Model === Vehicle) {
      query = query.populate({
        path: "driver",
        select: "id name", // Select only the 'id' and 'name' fields
      });
    }

    const doc = await query;
    if (Model == Vehicle) {
      const userCount = await User.countDocuments({
        vehicles: req.params._id,
      });
      console.log(userCount);
      doc.userCount = userCount;
      doc.users = null;
    }

    // console.log(doc);

    // Handle specific logic for Organisation model
    if (Model === Organisation) {
      await helpers.updateVehiclesAndUser(
        doc,
        req.user.id,
        "org-admin",
        req.body.vehicles,
        session
      );
    }

    if (!doc) {
      return next(new AppError("No document found with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        data: doc,
      },
    });
  });

exports.createOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.create(req.body);

    res.status(201).json({
      status: "success",
      data: {
        data: doc,
      },
    });
  });

exports.getOne = (Model, popOptions) =>
  catchAsync(async (req, res, next) => {
    let doc;
    let unreadNotificationsCount = 0;

    if (Model === User) {
      unreadNotificationsCount = await Notification.countDocuments({
        user: req.user.id,
        readStatus: false,
      });
    }

    let query = Model.findById(req.params.id);
    if (popOptions) query = query.populate(popOptions);
    doc = await query;

    if (!doc) {
      return next(new AppError("No document found with that ID", 404));
    }

    // Convert the Mongoose document to a plain JavaScript object
    let docObject = doc.toObject();

    // Add unreadNotificationsCount to the plain JavaScript object
    docObject.unreadNotificationsCount = unreadNotificationsCount;

    res.status(200).json({
      status: "success",
      data: {
        data: docObject, // Include the modified document object
      },
    });
  });

exports.getAll = (Model) =>
  catchAsync(async (req, res, next) => {
    let filter = {};
    if (req.params.tourId) filter = { ...filter, tour: req.params.tourId };
    if (req.params.organisationId) {
      if (Model === User) {
        filter = {
          organisations: {
            $in: [mongoose.Types.ObjectId(req.params.organisationId)],
          },
        };
      }
      if (Model === Vehicle) {
        filter = {
          organisation: req.params.organisationId,
        };
      }
    }
    if (req.params.userId)
      filter = { ...filter, users: { $in: [req.params.userId] } };

    console.log("filter", filter);

    // BUILD THE QUERY
    let query = Model.find(filter);

    if (Model === User) {
      query = query.populate("organisations");
    }

    if (Model === Vehicle) {
      query = query.populate({
        path: "driver",
        select: "id name", // Select only the 'id' and 'name' fields
      });
    }

    let features = new APIFeatures(query, req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    console.log(features);

    // EXECUTE THE QUERY
    let data = await features.query;

    // Efficiently calculate userCount
    if (Model === Vehicle) {
      data = await Promise.all(
        data.map(async (vehicle) => {
          const userCount = await User.countDocuments({
            vehicles: vehicle._id,
          });
          vehicle = vehicle.toObject();
          vehicle.userCount = userCount;
          vehicle.users = null; // Set users to null after calculating count
          return vehicle;
        })
      );
    }

    // SEND RESPONSE
    res.status(200).json({
      status: "success",
      results: data.length,
      data: {
        data,
      },
    });
  });

async function whenUserModel(req) {
  const aggregationPipeline = [
    { $match: { _id: mongoose.Types.ObjectId(req.user.id) } },
    {
      $lookup: {
        from: "notifications",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$user", "$$userId"] },
                  { $eq: ["$readStatus", false] },
                ],
              },
            },
          },
          { $count: "unreadCount" },
        ],
        as: "unreadNotifications",
      },
    },
    {
      $addFields: {
        unreadNotificationsCount: {
          $arrayElemAt: ["$unreadNotifications.unreadCount", 0],
        },
      },
    },
    { $project: { unreadNotifications: 0 } }, // Optionally, remove the unreadNotifications array from the result
  ];

  const results = await User.aggregate(aggregationPipeline);
  return results;
}
