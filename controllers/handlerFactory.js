const APIFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const mongoose = require('mongoose');
const setTransaction = require('./transactionController');
const helpers = require('../utils/helper');

exports.fn = function () {
  console.log('this is the export functionx');
};

exports.deleteOne = (Model) => {
  // On each delete, if the references of the document also needs to be deleted,
  // then we will have to check if the document has a model/schema type which can have references of
  // its documents in the other models / schema's.
  return setTransaction(async (req, res, next, session) => {
    const doc = await Model.findByIdAndDelete(req.params.id, { session });
    if (!doc) {
      throw new Error('No document found with that ID');
    }
    res.status(204).json({
      data: null,
    });
  });
};

exports.updateOne = (Model) =>
  setTransaction(async (req, res, next, session) => {
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
    if (popOptions) query = query.populate(popOptions);
    let doc = await query;

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc, // Include the modified document object
      },
    });
  });

exports.getAll = (Model) =>
  catchAsync(async (req, res, next) => {
    let filter = {};
    if (req.params.productId)
      filter = { ...filter, tour: req.params.productId };

    console.log('filter', filter);

    // BUILD THE QUERY
    let query = Model.find(filter);

    let features = new APIFeatures(query, req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    console.log(features);

    // EXECUTE THE QUERY
    let data = await features.query;

    // SEND RESPONSE
    res.status(200).json({
      status: 'success',
      results: data.length,
      data: {
        data,
      },
    });
  });
