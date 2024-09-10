const Order = require('../models/orderModel');
const Cart = require('../models/cartModel');
const User = require('../models/userModel');
const Product = require('../models/productModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const ErrorCodes = require('../utils/appErrorCodes');
const PromoCode = require('../models/promoCodeModel');
const factory = require('../controllers/handlerFactory');
const setTransaction = require('../controllers/transactionController');
const geolib = require('geolib');

const MINIMUM_AGE = 21;

// Helper function to calculate age
const calculateAge = (dob) => {
  const diff = Date.now() - new Date(dob).getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

const DELIVERY_FEE_BASE = 5; // Base fee for delivery
const SERVICE_FEE_BASE = 1.5; // Base fee for service
const MIN_DELIVERY_AMOUNT = 15;

// Hardcoded seller's location (longitude, latitude)
const sellerLocation = {
  latitude: 40.7128, // Example: New York City coordinates
  longitude: -74.006,
};

// Helper function to calculate distance in kilometers
const calculateDistance = (fromLocation, toLocation) => {
  return geolib.getDistance(fromLocation, toLocation) / 1000; // Convert meters to kilometers
};

const createOrder = setTransaction(async (req, res, next, session) => {
  const userId = req.user._id;

  // 1. Retrieve user and check their age
  const user = await User.findById(userId).session(session);
  if (!user || !user.dateOfBirth) {
    return next(new AppError('User not found or missing date of birth', 400));
  }

  const userAge = calculateAge(user.dateOfBirth);
  if (userAge < MINIMUM_AGE) {
    return next(
      new AppError(
        `You must be at least ${MINIMUM_AGE} years old to place an order`,
        403,
        ErrorCodes.MIN_AGE_RESTRICTION,
      ),
    );
  }

  // 2. Retrieve the cart items for the user
  const cart = await Cart.findOne({ user: userId })
    .populate('items.product')
    .session(session);
  if (!cart || cart.items.length === 0) {
    return next(new AppError('Your cart is empty', 400));
  }

  // 3. Calculate the total price of the products in the order
  let productTotalPrice = 0;
  cart.items.forEach((item) => {
    productTotalPrice += item.quantity * item.product.price;
  });

  // Add the tip amount if provided
  const tipAmount = req.body.tipAmount || 0;
  productTotalPrice += tipAmount;

  // 4. Ensure the order meets the minimum delivery amount
  if (productTotalPrice < MIN_DELIVERY_AMOUNT) {
    return next(
      new AppError(
        `Minimum order amount for delivery is $${MIN_DELIVERY_AMOUNT}`,
        400,
      ),
    );
  }

  // 5. Retrieve the user's delivery address
  const deliveryAddress = user.deliveryAddressLocations.find(
    (address) => address.default === true,
  );

  if (!deliveryAddress || !deliveryAddress.coordinates) {
    return next(new AppError('Invalid delivery address', 400));
  }

  // 6. Calculate the distance between the seller's location and the user's delivery address
  const distance = calculateDistance(
    {
      latitude: deliveryAddress.coordinates[1],
      longitude: deliveryAddress.coordinates[0],
    },
    sellerLocation,
  );

  // 7. Calculate dynamic delivery and service fees based on distance
  const deliveryFee = DELIVERY_FEE_BASE + distance * 0.5; // Add $0.5 per km
  const serviceFee = SERVICE_FEE_BASE + (distance > 10 ? 2 : 0); // Add extra $2 if distance is > 10km

  // 8. Apply promo code discount (if applicable)
  const promoCode = req.body.promoCode || null;
  let discountAmount = 0;
  if (promoCode) {
    const promo = await PromoCode.findOne({ code: promoCode });

    if (!promo || promo.expirationDate < Date.now()) {
      return next(new AppError('Promo code is invalid or expired', 400));
    }

    if (productTotalPrice < promo.minOrderValue) {
      return next(
        new AppError(
          `Minimum order value to apply this promo code is $${promo.minOrderValue}`,
          400,
          ErrorCodes.MIN_ORDER_AMOUNT_RESTRICTION,
        ),
      );
    }

    if (promo.discountType === 'percentage') {
      discountAmount = (productTotalPrice * promo.discountValue) / 100;
    } else if (promo.discountType === 'flat') {
      discountAmount = promo.discountValue;
    }

    productTotalPrice -= discountAmount;
  }

  // 9. Calculate the final total price including delivery and service fees
  let totalPrice = productTotalPrice + deliveryFee + serviceFee;

  // 10. Create the order
  const newOrder = await Order.create(
    [
      {
        user: userId,
        items: cart.items.map((item) => ({
          product: item.product._id,
          quantity: item.quantity,
        })),
        deliveryAddress: deliveryAddress,
        paymentMethod: req.body.paymentMethod,
        tipAmount: tipAmount,
        promoCode: promoCode,
        totalPrice: totalPrice,
        serviceFee: serviceFee,
        deliveryFee: deliveryFee,
      },
    ],
    { session },
  );

  for (const item of cart.items) {
    await Product.findByIdAndUpdate(item.product.id, {
      $inc: { stock: -item.quantity },
    }).session(session);
  }

  // 11. Optionally clear the cart after order creation
  await Cart.findOneAndDelete({ user: userId }).session(session);

  // 12. Send response with the created order
  res.status(201).json({
    status: 'success',
    data: {
      order: newOrder,
    },
  });
});

const getOrders = factory.getAll(Order);
const getOrder = factory.getOne(Order);

const cancelOrder = setTransaction(async (req, res, next, session) => {
  const userId = req.user._id;
  const orderId = req.params.orderId;

  // 1. Retrieve the order by ID and ensure it belongs to the user
  const order = await Order.findOne({ _id: orderId, user: userId }).session(
    session,
  );

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  // 2. Check if the order is in a cancellable state (e.g., not delivered or being processed)
  if (order.status === 'delivered' || order.status === 'processing') {
    return next(
      new AppError(
        'This order cannot be canceled because it has already been delivered or is being processed',
        400,
      ),
    );
  }

  // 3. Optionally, handle logic to restore inventory if necessary
  // (You might want to update product stock if applicable)
  // For example:
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity },
    });
  }

  // 4. Mark the order as canceled
  order.status = 'canceled';
  await order.save();

  // 5. Optionally clear the cart if you want to restore the items for the user
  await Cart.findOneAndDelete({ user: userId }).session(session);

  // 6. Send a response to the user
  res.status(200).json({
    status: 'success',
    message: 'Order has been successfully canceled',
    data: {
      order,
    },
  });
});

module.exports = {
  createOrder,
  cancelOrder,
  getOrders,
  getOrder,
};
