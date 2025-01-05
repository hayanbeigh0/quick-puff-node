const Advertisement = require('../models/advertisementModel'); // Import the Advertisement model
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');

// Use the factory to create CRUD operations for Advertisement
const createAdvertisement = factory.createOne(Advertisement);
const updateAdvertisement = factory.updateOne(Advertisement);
const getAdvertisements = factory.getAll(Advertisement);
const getAdvertisement = factory.getOne(Advertisement);
const deleteAdvertisement = factory.deleteOne(Advertisement);

// Get advertisements based on product category
const getAdvertisementBasedOnProductCategory = catchAsync(async (req, res, next) => {
  const { categoryId } = req.params;

  // Find advertisements by joining with products and filtering by category
  const advertisements = await Advertisement.aggregate([
    // Join with products collection
    {
      $lookup: {
        from: 'products',
        localField: 'product',
        foreignField: '_id',
        as: 'productInfo'
      }
    },
    // Unwind the productInfo array
    {
      $unwind: '$productInfo'
    },
    // Match products with the specified category
    {
      $match: {
        'productInfo.productCategory': require('mongoose').Types.ObjectId(categoryId),
        'isActive': true // Only get active advertisements
      }
    },
    // Project the fields we want to return
    {
      $project: {
        _id: 0,
        id: '$_id',
        title: 1,
        description: 1,
        image: 1,
        link: 1,
        product: {
          id: '$productInfo._id',
          name: '$productInfo.name',
          price: '$productInfo.price',
          image: '$productInfo.image'
        },
        startDate: 1,
        endDate: 1,
        viewCount: 1,
        clickCount: 1
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    results: advertisements.length,
    data: {
      advertisements
    }
  });
});

module.exports = {
  createAdvertisement,
  updateAdvertisement,
  getAdvertisements,
  getAdvertisement,
  deleteAdvertisement,
  getAdvertisementBasedOnProductCategory,
};
