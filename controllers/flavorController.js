const Flavor = require('../models/flavorModel');
const APIFeatures = require('../utils/apiFeatures');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');

const createFlavor = factory.createOne(Flavor);
const updateFlavor = factory.updateOne(Flavor);
const getFlavors = catchAsync(async (req, res, next) => {
  let filter = {};
  if (req.params.productId) filter = { product: req.params.productId };

  // Build the query
  let query = Flavor.find(filter);

  // Apply API Features like filtering, sorting, limiting fields, and pagination
  const features = new APIFeatures(query, req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  let data = await features.query;

  const totalItems = await Flavor.countDocuments(filter);
  const limit = features.queryString.limit * 1 || 100;
  const page = features.queryString.page * 1 || 1;
  const totalPages = Math.ceil(totalItems / limit);

  res.status(200).json({
    status: 'success',
    results: data.length,
    flavors: data,
    pageInfo: {
      page,
      limit,
      totalPages,
      totalItems
    },
  });
});
const getFlavor = factory.getOne(Flavor);
const deleteFlavor = factory.deleteOne(Flavor);

module.exports = {
  createFlavor,
  updateFlavor,
  getFlavor,
  getFlavors,
  deleteFlavor,
};
