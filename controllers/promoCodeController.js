const PromoCode = require('../models/promoCodeModel');
const Cart = require('../models/cartModel'); // Assuming you have a Cart model
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel'); // Assuming you have a User model
const FulfillmentCenter = require('../models/fulfillmentCenterModel'); // Assuming you have a FulfillmentCenter model
const geolib = require('geolib'); // Assuming you use geolib for distance calculation
const mongoose = require('mongoose');
const calculateChargesAndDiscount = require('../utils/calculateCharges');

const allowedFields = [
  'code',
  'discountType',
  'discountValue',
  'minOrderValue',
  'expirationDate',
  'usageLimit',
  'appliesTo',
  'applicableProducts',
  'applicableCategories',
  'applicableUsers',
  'applicableRegions'
];

const applyPromoCode = catchAsync(async (req, res, next) => {
  const { promoCode } = req.body;
  const userId = req.user.id;

  // Find the user's cart
  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    return next(new AppError('Cart not found', 404));
  }

  // Retrieve the user's delivery address
  const user = await User.findById(userId);
  const deliveryAddress = user.deliveryAddressLocations.find(
    (address) => address.default === true
  );

  if (!deliveryAddress || !deliveryAddress.coordinates) {
    return next(new AppError('Invalid delivery address', 400));
  }

  // Find the nearest fulfillment center
  const nearestFulfillmentCenter = await FulfillmentCenter.findOne({
    coordinates: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [
            deliveryAddress.coordinates[1],
            deliveryAddress.coordinates[0],
          ],
        },
        $maxDistance: 100000 * 1000,
      },
    },
  });

  if (!nearestFulfillmentCenter) {
    return next(new AppError('No fulfillment center available nearby', 404));
  }

  // Calculate charges and discount
  const charges = await calculateChargesAndDiscount(userId, cart, promoCode, deliveryAddress, nearestFulfillmentCenter);

  res.status(200).json({
    status: 'success',
    discount: charges.discount,
    originalAmount: charges.originalAmount,
    newAmount: charges.newAmount,
  });
});

const validatePromoCode = async (promoCode, cart, userId, deliveryAddress) => {
    const promo = await PromoCode.findOne({ code: promoCode });
    if (!promo || promo.expiryDate < Date.now()) {
        return next(new AppError('Invalid or expired promo code', 400));
    }

    // Check usage limit
    const userUsage = await PromoCode.aggregate([
        { $match: { code: promoCode, 'usedBy.userId': mongoose.Types.ObjectId(userId) } },
        { $unwind: '$usedBy' },
        { $match: { 'usedBy.userId': mongoose.Types.ObjectId(userId) } },
        { $group: { _id: '$usedBy.userId', totalUsage: { $sum: '$usedBy.count' } } }
    ]);

    if (userUsage.length > 0 && userUsage[0].totalUsage >= promo.usageLimit) {
        return next(new AppError('Promo code usage limit reached', 400));
    }

    // Check minimum order value
    if (cart.total < promo.minOrderValue) {
        return next(new AppError('Cart total does not meet the minimum order value for this promo code', 400));
    }

    // Check applicable products/categories
    // if (promo.applicableProducts && !cart.items.some(item => promo.applicableProducts.includes(item.productId))) {
    //     return next(new AppError('Promo code is not applicable to the products in your cart', 400));
    // }

    // Check applicable regions
    // if (promo.applicableRegions && !promo.applicableRegions.includes(deliveryAddress.region)) {
    //     return next(new AppError('Promo code is not applicable in your delivery region', 400));
    // }

    // Additional checks can be added here

    return true; // Promo code is valid
};

const filterObject = (obj, allowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach(key => {
        if (allowedFields.includes(key)) {
            newObj[key] = obj[key];
        }
    });
    return newObj;
};

// Create a new promo code
const createPromoCode = catchAsync(async (req, res, next) => {
    const filteredBody = filterObject(req.body, allowedFields);
    const promoCode = await PromoCode.create(filteredBody);
    res.status(201).json({
        status: 'success',
        promoCode,
    });
});

// Get all promo codes
const getAllPromoCodes = catchAsync(async (req, res, next) => {
    const promoCodes = await PromoCode.find();
    res.status(200).json({
        status: 'success',
        results: promoCodes.length,
        promoCodes,
    });
});

// Get a single promo code by ID
const getPromoCode = catchAsync(async (req, res, next) => {
    const promoCode = await PromoCode.findById(req.params.id);
    if (!promoCode) {
        return next(new AppError('No promo code found with that ID', 404));
    }
    res.status(200).json({
        status: 'success',
        promoCode,
    });
});

// Update a promo code by ID
const updatePromoCode = catchAsync(async (req, res, next) => {
    const promoCode = await PromoCode.findById(req.params.id);
    if (!promoCode) {
        return next(new AppError('No promo code found with that ID', 404));
    }

    // Filter the request body
    const filteredBody = filterObject(req.body, allowedFields);

    // Update only the fields that are provided in the filtered body
    Object.keys(filteredBody).forEach((key) => {
        promoCode[key] = filteredBody[key];
    });

    await promoCode.save();

    res.status(200).json({
        status: 'success',
        promoCode,
    });
});

// Delete a promo code by ID
const deletePromoCode = catchAsync(async (req, res, next) => {
    const promoCode = await PromoCode.findByIdAndDelete(req.params.id);
    if (!promoCode) {
        return next(new AppError('No promo code found with that ID', 404));
    }
    res.status(204).json({
        status: 'success',
        data: null,
    });
});

module.exports = {
    applyPromoCode,
    validatePromoCode,
    createPromoCode,
    getAllPromoCodes,
    getPromoCode,
    updatePromoCode,
    deletePromoCode,
}; 