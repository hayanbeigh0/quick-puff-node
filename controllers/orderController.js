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
const RAZORPAY_SECRET = '<RAZORPAY_SECRET>';

// Hardcoded seller's location (longitude, latitude)
const sellerLocation = {
  latitude: 40.7128, // Example: New York City coordinates
  longitude: -74.006,
};

// Helper function to calculate distance in kilometers
const calculateDistance = (fromLocation, toLocation) => {
  return geolib.getDistance(fromLocation, toLocation) / 1000; // Convert meters to kilometers
};

const generateUniqueOrderNumber = async () => {
  let orderNumber;
  let isUnique = false;

  // Loop until we find a unique order number
  while (!isUnique) {
    // Generate a random 7-digit number
    const randomCode = Math.floor(1000000 + Math.random() * 9000000); // Generates a random 7-digit number
    orderNumber = `QPO-${randomCode}`;

    // Check if this order number already exists in the database
    const existingOrder = await Order.findOne({ orderNumber });

    if (!existingOrder) {
      isUnique = true; // If no existing order is found, this order number is unique
    }
  }

  return orderNumber; // Return the unique order number
};

const verifyPayment = async (paymentGatewayResponse) => {
  // Depending on the gateway, you will verify the payment.
  // Example with Razorpay:
  const { paymentId, orderId, signature } = paymentGatewayResponse;

  // Razorpay signature verification example (pseudo code):
  const generatedSignature = crypto
    .createHmac('sha256', RAZORPAY_SECRET)
    .update(orderId + '|' + paymentId)
    .digest('hex');

  if (generatedSignature !== signature) {
    throw new AppError('Payment verification failed', 400);
  }

  return true;
};

const createOrder = setTransaction(async (req, res, next, session) => {
  const userId = req.user._id;

  // 1. Retrieve user and check their age
  const user = await User.findById(userId).session(session);
  if (!user || !user.dateOfBirth) {
    return next(new AppError('User not found or missing date of birth', 400));
  }

  if (!user.idVerified) {
    return next(
      new AppError(
        'User ID not verified!',
        400,
        ErrorCodes.USER_ID_NOT_VERIFIED.code,
      ),
    );
  }

  const userAge = calculateAge(user.dateOfBirth);
  if (userAge < MINIMUM_AGE) {
    return next(
      new AppError(
        `You must be at least ${MINIMUM_AGE} years old to place an order`,
        403,
        ErrorCodes.MIN_AGE_RESTRICTION.code,
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

  const tipAmount = req.body.tipAmount || 0;
  productTotalPrice += tipAmount;

  if (productTotalPrice < MIN_DELIVERY_AMOUNT) {
    return next(
      new AppError(
        `Minimum order amount for delivery is $${MIN_DELIVERY_AMOUNT}`,
        400,
      ),
    );
  }

  // 4. Retrieve the user's delivery address
  const deliveryAddress = user.deliveryAddressLocations.find(
    (address) => address.default === true,
  );

  if (!deliveryAddress || !deliveryAddress.coordinates) {
    return next(new AppError('Invalid delivery address', 400));
  }

  // 5. Calculate the distance between the seller's location and the user's delivery address
  const distance = calculateDistance(
    {
      latitude: deliveryAddress.coordinates[1],
      longitude: deliveryAddress.coordinates[0],
    },
    sellerLocation,
  );

  // 6. Calculate dynamic delivery and service fees based on distance
  const deliveryFee = DELIVERY_FEE_BASE + distance * 0.5; // Add $0.5 per km
  const serviceFee = SERVICE_FEE_BASE + (distance > 10 ? 2 : 0); // Add extra $2 if distance is > 10km

  // 7. Estimate delivery time (assumed delivery speed of 40 km/h)
  const deliverySpeedKmPerHour = 40; // Example: constant speed of 40 km/h
  const estimatedDeliveryTimeHours = distance / deliverySpeedKmPerHour;

  // Convert hours to minutes
  const estimatedDeliveryTimeMinutes = Math.ceil(
    estimatedDeliveryTimeHours * 60,
  );

  // Format the time range for delivery
  const formatTimeRange = (createdAt, deliveryTimeMinutes) => {
    const startDate = new Date(createdAt);
    const endDate = new Date(startDate);
    endDate.setMinutes(startDate.getMinutes() + deliveryTimeMinutes);

    const formatTime = (date) => {
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12 || 12; // Convert to 12-hour format
      return `${hours}:${minutes} ${ampm}`;
    };

    const startTime = formatTime(startDate);
    const endTime = formatTime(endDate);

    return `${startTime} - ${endTime}`;
  };

  const deliveryTimeRange = formatTimeRange(
    new Date(),
    estimatedDeliveryTimeMinutes,
  );

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
          ErrorCodes.MIN_ORDER_AMOUNT_RESTRICTION.code,
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

  // 10. Generate a unique order number
  const orderNumber = await generateUniqueOrderNumber();

  // 11. Set payment details based on the payment method
  let paymentStatus = 'pending'; // For 'cash_on_delivery' or 'credit_card_on_delivery'
  let transactionId = null;

  if (req.body.paymentMethod === 'credit_card') {
    // Verify the payment if it's a credit card payment
    const paymentVerified = await verifyPayment(
      req.body.paymentGatewayResponse,
    );

    if (!paymentVerified) {
      return next(new AppError('Payment verification failed', 400));
    }

    paymentStatus = 'paid';
    transactionId = req.body.transactionId; // Set transaction ID for successful card payments
  }

  // 12. Create the order and set all relevant fields, including deliveryTimeRange
  const newOrder = await Order.create(
    [
      {
        user: userId,
        orderNumber: orderNumber, // Assign the unique order number here
        items: cart.items.map((item) => ({
          product: item.product._id,
          quantity: item.quantity,
        })),
        deliveryAddress: deliveryAddress,
        paymentMethod: req.body.paymentMethod,
        paymentStatus: paymentStatus, // 'pending' for COD or 'paid' for successful credit card payments
        transactionId: transactionId, // Set transaction ID only for credit card payments
        tipAmount: tipAmount,
        promoCode: promoCode,
        totalPrice: totalPrice,
        serviceFee: serviceFee,
        deliveryFee: deliveryFee,
        trackingNumber: req.body.trackingNumber || '', // Set tracking number if available
        status: 'pending', // Initial status of the order
        statusHistory: [{ status: 'pending', changedAt: new Date() }], // Initialize status history
        orderNotes: req.body.orderNotes || '', // Optional order notes from user
        deliveryTimeRange: deliveryTimeRange, // Store the delivery time range here
      },
    ],
    { session },
  );

  // 13. Restore the inventory
  for (const item of cart.items) {
    await Product.findByIdAndUpdate(item.product._id, {
      $inc: { stock: -item.quantity },
    }).session(session);
  }

  // 14. Clear the cart after order creation
  await Cart.findOneAndDelete({ user: userId }).session(session);

  // 15. Send response with the created order including deliveryTimeRange
  res.status(201).json({
    status: 'success',
    orders: newOrder,
    deliveryTimeRange: deliveryTimeRange, // Send delivery time range in the response
  });
});

const getOrders = factory.getAll(Order);
const getOrder = catchAsync(async (req, res, next) => {
  let query = Order.findById(req.params.id);

  // Use 'populate' with 'select' to get specific fields from 'product'
  query.populate({
    path: 'items.product',
    select: 'name price image', // Specify the fields you want to include
  });

  let order = await query;

  // Handle case if no order is found
  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }

  // Send response with the populated order
  res.status(200).json({
    status: 'success',
    order,
  });
});

const getOrdersOnDate = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { date } = req.body;

  if (!date) {
    return next(new AppError('Please provide a valid date', 400));
  }

  const startDate = new Date(date);
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 1); // Next day to use as the end range for the query

  const orders = await Order.aggregate([
    {
      $match: {
        user: userId,
        createdAt: { $gte: startDate, $lt: endDate }, // Match orders on the specific date
      },
    },
    {
      $unwind: '$items', // Unwind the items array so we can perform lookup per item
    },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'productDetails',
      },
    },
    {
      $unwind: '$productDetails', // Unwind the product details since each item corresponds to one product
    },
    {
      $group: {
        _id: '$_id',
        orderNumber: { $first: '$orderNumber' },
        totalPrice: { $first: '$totalPrice' },
        status: { $first: '$status' },
        deliveryTimeRange: { $first: '$deliveryTimeRange' },
        createdAt: { $first: '$createdAt' },
        items: {
          $push: {
            id: '$items._id', // Assuming each item has its own _id
            product: {
              id: '$productDetails._id', // Product details
              name: '$productDetails.name',
              price: '$productDetails.price',
              image: '$productDetails.image',
            },
            quantity: '$items.quantity', // Keep the quantity field from each item
          },
        },
      },
    },
    {
      $project: {
        id: '$_id', // Rename _id to id for the order
        orderNumber: 1,
        totalPrice: 1,
        status: 1,
        deliveryTimeRange: 1,
        createdAt: 1,
        items: 1,
        _id: 0,
      },
    },
  ]);

  if (orders.length === 0) {
    return next(new AppError('No orders found for the selected date', 404));
  }

  res.status(200).json({
    status: 'success',
    results: orders.length,
    orders,
  });
});

const getOrderDates = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  const orderDates = await Order.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, // Group by date
      },
    },
    {
      $sort: { _id: 1 }, // Sort by date in ascending order
    },
  ]);

  const dates = orderDates.map((order) => order._id);

  if (dates.length === 0) {
    return next(new AppError('No order dates found for this user', 404));
  }

  res.status(200).json({
    status: 'success',
    dates,
  });
});

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

  // 3. Logic to restore inventory
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

const updateOrderStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params; // Order ID from the request parameters
  const { newStatus } = req.body; // New status from the request body

  // Find the order by ID
  const order = await Order.findById(id);

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  // Optional: Validate status transition logic (e.g., cannot move from 'delivered' back to 'shipped')
  const currentStatus = order.status;

  if (currentStatus === 'delivered' && newStatus !== 'cancelled') {
    return next(
      new AppError('Cannot update the status of a delivered order', 400),
    );
  }

  // Update the current status and add to the status history
  order.status = newStatus;
  order.statusHistory.push({
    status: newStatus,
    changedAt: new Date(),
  });

  // Save the order
  await order.save();

  // Return the updated order
  res.status(200).json({
    status: 'success',
    order,
  });
});

module.exports = {
  createOrder,
  cancelOrder,
  getOrders,
  getOrder,
  getOrderDates,
  getOrdersOnDate,
  updateOrderStatus,
};
