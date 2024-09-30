const APIFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const setTransaction = require('./transactionController');

exports.fn = function () {
  console.log('this is the export function');
};

exports.deleteOne = (Model) => {
  // On each delete, check for references that may also need to be deleted.
  return catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) {
      throw new AppError('No document found with that ID', 404);
    }
    res.status(204).json({
      status: 'success',
      data: null,
    });
  });
};

exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.createOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.create(req.body);

    res.status(201).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.getOne = (Model, popOptions) =>
  catchAsync(async (req, res, next) => {
    let query = Model.findById(req.params.id);

    // If there are population options, apply the .populate() method
    if (popOptions) query = query.populate(popOptions);

    const doc = await query;

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.getAll = (Model, popOptions) =>
  catchAsync(async (req, res, next) => {
    let filter = {};
    if (req.params.productId) filter = { product: req.params.productId };

    // Build the query
    let query = Model.find(filter);

    // Apply API Features like filtering, sorting, limiting fields, and pagination
    const features = new APIFeatures(query, req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    let data = await features.query;

    // Populate related fields (e.g., 'product', 'flavor')
    if (popOptions) {
      data = await Model.populate(data, popOptions);
    }

    res.status(200).json({
      status: 'success',
      results: data.length,
      data: {
        data,
      },
    });
  });
