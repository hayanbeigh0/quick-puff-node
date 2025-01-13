const geolib = require('geolib');
const PromoCode = require('../models/promoCodeModel');
const AppError = require('../utils/appError');

const calculateChargesAndDiscount = async (userId, cart, promoCode, deliveryAddress, fulfillmentCenter) => {
  // Calculate product total
  let productTotalPrice = 0;
  cart.items.forEach((item) => {
    productTotalPrice += item.quantity * item.product.price;
  });

  // Calculate the distance
  const distance = geolib.getDistance(
    {
      latitude: deliveryAddress.coordinates[1],
      longitude: deliveryAddress.coordinates[0],
    },
    {
      latitude: fulfillmentCenter.coordinates[1],
      longitude: fulfillmentCenter.coordinates[0],
    }
  );

  // Calculate fees based on distance
  const deliveryFee = 5 + (distance / 1000) * 0.5;
  const serviceFee = 1.5 + (distance > 10000 ? 2 : 0);

  let discount = 0;
  let discountedProperty = '';
  let originalAmount = productTotalPrice + deliveryFee + serviceFee;
  let newAmount = originalAmount;

  if (promoCode) {
    const promo = await PromoCode.findOne({ code: promoCode });
    if (!promo || promo.expiryDate < Date.now()) {
      throw new AppError('Invalid or expired promo code', 400);
    }

    const userUsage = await PromoCode.aggregate([
      { $match: { code: promoCode } },
      { $unwind: '$usedBy' },
      { $match: { 'usedBy.userId': userId } },
      { $group: { _id: '$usedBy.userId', totalUsage: { $sum: '$usedBy.count' } } }
    ]);

    if (userUsage.length > 0 && userUsage[0].totalUsage >= promo.usageLimit) {
      throw new AppError('Promo code usage limit reached', 400);
    }

    discountedProperty = promo.appliesTo;

    if (promo.appliesTo === 'product') {
      if (promo.discountType === 'percentage') {
        discount = (productTotalPrice * promo.discountValue) / 100;
      } else if (promo.discountType === 'fixed') {
        discount = promo.discountValue;
      }
      discount = Math.min(discount, productTotalPrice);
    } else if (promo.appliesTo === 'service' || promo.appliesTo === 'delivery') {
      const applicableFee = promo.appliesTo === 'service' ? serviceFee : deliveryFee;
      if (promo.discountType === 'percentage') {
        discount = (applicableFee * promo.discountValue) / 100;
      } else if (promo.discountType === 'fixed') {
        discount = promo.discountValue;
      }
      discount = Math.min(discount, applicableFee);
    }

    newAmount = originalAmount - discount;
  }

  return {
    productTotalPrice,
    deliveryFee,
    serviceFee,
    discount: promoCode ? { amount: discount, property: discountedProperty } : null,
    originalAmount,
    newAmount,
  };
};

module.exports = calculateChargesAndDiscount; 