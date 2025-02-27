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
const FulfillmentCenter = require('../models/fulfillmentCenterModel');
const { sendNotification } = require('../notifications');
const { clearProductRelatedCaches } = require('../utils/cacheManager');
const { validatePromoCode } = require('./promoCodeController');
const calculateChargesAndDiscount = require('../utils/calculateCharges');

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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

// Helper function to create Stripe payment intent
const createPaymentIntent = async (amount, currency = 'usd') => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency,
    payment_method_types: ['card'],
  });
  return paymentIntent;
};

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

const createOrder = setTransaction(async (req, res, next, session) => {
  const userId = req.user._id;
  const promoCode = req.body.promoCode || null;

  // Retrieve the cart items for the user
  const cart = await Cart.findOne({ user: userId })
    .populate('items.product')
    .session(session);
  if (!cart || cart.items.length === 0) {
    return next(new AppError('Your cart is empty', 400));
  }

  // Retrieve the user's delivery address
  const user = await User.findById(userId).session(session);
  const deliveryAddress = user.deliveryAddressLocations.find(
    (address) => address.default === true,
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
  }).session(session);

  if (!nearestFulfillmentCenter) {
    return next(new AppError('No fulfillment center available nearby', 404));
  }

  // Calculate charges and discount
  const charges = await calculateChargesAndDiscount(userId, cart, promoCode, deliveryAddress, nearestFulfillmentCenter);

  // Add tip amount to the new amount
  charges.newAmount = charges.newAmount + req.body.tipAmount || 0;
  // Generate order number
  const orderNumber = await generateUniqueOrderNumber();

  // Calculate the distance between the fulfillment center and the user's delivery address
  const distance = calculateDistance(
    {
      latitude: deliveryAddress.coordinates[1],
      longitude: deliveryAddress.coordinates[0],
    },
    {
      latitude: nearestFulfillmentCenter.coordinates[1],
      longitude: nearestFulfillmentCenter.coordinates[0],
    },
  );

  // Calculate estimated delivery time (assumed delivery speed of 40 km/h)
  const deliverySpeedKmPerHour = 40; // Example speed
  const estimatedDeliveryTimeHours = distance / deliverySpeedKmPerHour;
  const estimatedDeliveryTimeMinutes = Math.ceil(estimatedDeliveryTimeHours * 60);

  const deliveryTimeRange = formatTimeRange(new Date(), estimatedDeliveryTimeMinutes);

  // Create the order
  const newOrder = await Order.create([
    {
      user: userId,
      createdByEmail: req.user.email,
      orderNumber: orderNumber,
      items: cart.items.map((item) => ({
        product: item.product._id,
        quantity: item.quantity,
      })),
      deliveryAddress: deliveryAddress,
      fromAddress: nearestFulfillmentCenter,
      paymentMethod: req.body.paymentMethod,
      paymentStatus: 'pending',
      tipAmount: req.body.tipAmount || 0,
      promoCode: promoCode,
      discount: charges.discount,
      totalPrice: charges.newAmount,
      serviceFee: charges.serviceFee,
      deliveryFee: charges.deliveryFee,
      status: 'awaiting-payment',
      statusHistory: [{
        status: 'awaiting-payment',
        changedAt: new Date()
      }],
      deliveryTimeRange: deliveryTimeRange,
    }
  ], { session });

  // Restore the inventory
  for (const item of cart.items) {
    await Product.findByIdAndUpdate(item.product._id, {
      $inc: { stock: -item.quantity },
    }).session(session);
  }

  // Clear the cart after order creation
  await Cart.findOneAndDelete({ user: userId }).session(session);

  // Populate the product details, delivery partner, and from address in the newly created order
  const populatedOrder = await Order.findById(newOrder[0]._id)
    .populate('items.product')
    .populate('deliveryPartner')
    .populate('fromAddress')
    .session(session);

  // Send the response with the new order details
  res.status(201).json({
    status: 'success',
    order: populatedOrder,
  });

  // After updating product stocks
  clearProductRelatedCaches();
});

const getAdditionalCharges = setTransaction(async (req, res, next, session) => {
  const userId = req.user._id;
  const user = await User.findById(userId);
  if (!user || !user.dateOfBirth) {
    return next(new AppError('User not found or missing date of birth', 400));
  }
  // 4. Retrieve the user's delivery address
  const deliveryAddress = user.deliveryAddressLocations.find(
    (address) => address.default === true,
  );

  if (!deliveryAddress || !deliveryAddress.coordinates) {
    return next(new AppError('Invalid delivery address', 400));
  }

  const MAX_DISTANCE_KM = 100000;

  console.log(deliveryAddress.coordinates);

  // 5. Find the nearest fulfillment center to the user's delivery address
  const nearestFulfillmentCenter = await FulfillmentCenter.findOne({
    coordinates: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [
            deliveryAddress.coordinates[1],
            deliveryAddress.coordinates[0],
          ], // User's delivery coordinates
        },
        $maxDistance: MAX_DISTANCE_KM * 1000, // Convert km to meters
      },
    },
  }).session(session);

  console.log(nearestFulfillmentCenter);

  if (!nearestFulfillmentCenter) {
    return next(
      new AppError(
        'No fulfillment center available nearby',
        404,
        ErrorCodes.NO_NEAREST_FULLFILMENT_CENTER_FOUND.code,
      ),
    );
  }

  // 6. Calculate the distance between the fulfillment center and the user's delivery address
  const distance = calculateDistance(
    {
      latitude: deliveryAddress.coordinates[1],
      longitude: deliveryAddress.coordinates[0],
    },
    {
      latitude: nearestFulfillmentCenter.coordinates[1],
      longitude: nearestFulfillmentCenter.coordinates[0],
    },
  );

  // 7. Calculate dynamic delivery and service fees based on distance
  const deliveryFee = DELIVERY_FEE_BASE + distance * 0.5; // Add $0.5 per km
  const serviceFee = SERVICE_FEE_BASE + (distance > 10 ? 2 : 0); // Add extra $2 if distance is > 10km
  res.status(200).json({
    status: 'success',
    deliveryFee,
    serviceFee,
  });
});

const reorder = setTransaction(async (req, res, next, session) => {
  const userId = req.user._id;
  const { orderId } = req.params;
  const promoCode = req.body.promoCode || null;

  // Retrieve the original order
  const originalOrder = await Order.findById(orderId).populate('items.product').session(session);
  if (!originalOrder) {
    return next(new AppError('Original order not found', 404));
  }

  // Create new items array from the original order
  const newItems = originalOrder.items.map(item => ({
    product: item.product._id,
    quantity: item.quantity,
  }));

  // Calculate product total
  let productTotalPrice = 0;
  newItems.forEach((item) => {
    productTotalPrice += item.quantity * item.product.price;
  });

  const tipAmount = req.body.tipAmount || 0;
  productTotalPrice += tipAmount;

  if (productTotalPrice < MIN_DELIVERY_AMOUNT) {
    return next(new AppError(`Minimum order amount for delivery is $${MIN_DELIVERY_AMOUNT}`, 400));
  }

  // Retrieve the user's delivery address
  const user = await User.findById(userId).session(session);
  const deliveryAddress = user.deliveryAddressLocations.find(
    (address) => address.default === true,
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
  }).session(session);

  if (!nearestFulfillmentCenter) {
    return next(new AppError('No fulfillment center available nearby', 404));
  }

  // Calculate charges and discount
  const charges = await calculateChargesAndDiscount(userId, { items: newItems }, promoCode, deliveryAddress, nearestFulfillmentCenter);

  // Add tip amount to the new amount
  charges.newAmount = charges.newAmount + tipAmount;

  // Generate order number
  const orderNumber = await generateUniqueOrderNumber();

  // Calculate the distance between the fulfillment center and the user's delivery address
  const distance = calculateDistance(
    {
      latitude: deliveryAddress.coordinates[1],
      longitude: deliveryAddress.coordinates[0],
    },
    {
      latitude: nearestFulfillmentCenter.coordinates[1],
      longitude: nearestFulfillmentCenter.coordinates[0],
    },
  );

  // Calculate estimated delivery time (assumed delivery speed of 40 km/h)
  const deliverySpeedKmPerHour = 40; // Example speed
  const estimatedDeliveryTimeHours = distance / deliverySpeedKmPerHour;
  const estimatedDeliveryTimeMinutes = Math.ceil(estimatedDeliveryTimeHours * 60);

  const deliveryTimeRange = formatTimeRange(new Date(), estimatedDeliveryTimeMinutes);

  // Create the new order
  const newOrder = await Order.create([{
    user: userId,
    createdByEmail: req.user.email,
    orderNumber: orderNumber,
    items: newItems,
    deliveryAddress: deliveryAddress,
    fromAddress: nearestFulfillmentCenter,
    paymentMethod: req.body.paymentMethod,
    paymentStatus: 'pending',
    tipAmount: tipAmount,
    promoCode: promoCode,
    discount: charges.discount,
    totalPrice: charges.newAmount,
    serviceFee: charges.serviceFee,
    deliveryFee: charges.deliveryFee,
    status: 'awaiting-payment',
    statusHistory: [{
      status: 'awaiting-payment',
      changedAt: new Date()
    }],
    deliveryTimeRange: deliveryTimeRange,
  }], { session });

  // Update product stock
  for (const item of newItems) {
    await Product.findByIdAndUpdate(
      item.product,
      { $inc: { stock: -item.quantity } }
    ).session(session);
  }

  // Populate the order details
  const populatedOrder = await Order.findById(newOrder[0]._id)
    .populate('items.product')
    .populate('deliveryPartner')
    .populate('fromAddress')
    .session(session);

  // Send response
  res.status(201).json({
    status: 'success',
    order: populatedOrder,
    discount: charges.discount,
    originalAmount: charges.originalAmount,
    newAmount: charges.newAmount,
  });
});

const getOrders = factory.getAll(Order, [
  {
    path: 'fromAddress',
  },
  {
    path: 'deliveryPartner',
  },
]);

const getOrder = catchAsync(async (req, res, next) => {
  let query = Order.findById(req.params.id);

  // Use 'populate' with 'select' to get specific fields from 'product'
  query
    .populate({
      path: 'items.product',
      select: 'name price image', // Specify the fields you want to include
    })
    .populate('fromAddress')
    .populate({
      path: 'deliveryPartner',
      select: 'firstName lastName phoneNumber email',
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
        status: { $nin: ['failed', 'awaiting-payment'] }, // Exclude failed and awaiting-payment orders
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
      $lookup: {
        from: 'users', // Lookup to populate delivery partner details
        localField: 'deliveryPartner',
        foreignField: '_id',
        as: 'deliveryPartnerDetails',
      },
    },
    {
      $unwind: {
        path: '$deliveryPartnerDetails',
        preserveNullAndEmptyArrays: true, // Keep orders with no assigned delivery partner
      },
    },
    // Add a $lookup to populate the fromAddress (FulfillmentCenter)
    {
      $lookup: {
        from: 'fulfillmentcenters', // The collection name for FulfillmentCenter
        localField: 'fromAddress', // Field in the Order model referencing the fulfillment center
        foreignField: '_id', // Foreign field in the FulfillmentCenter collection
        as: 'fromAddressDetails',
      },
    },
    {
      $unwind: {
        path: '$fromAddressDetails',
        preserveNullAndEmptyArrays: true, // Keep orders even if no fulfillment center is assigned
      },
    },
    {
      $group: {
        _id: '$_id',
        orderNumber: { $first: '$orderNumber' },
        totalPrice: { $first: '$totalPrice' },
        status: { $first: '$status' },
        deliveryTimeRange: { $first: '$deliveryTimeRange' },
        fromAddress: { $first: '$fromAddressDetails' }, // Include the populated FulfillmentCenter details
        createdAt: { $first: '$createdAt' },
        deliveryPartner: { $first: '$deliveryPartnerDetails' }, // Add the populated delivery partner info
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
      $sort: { createdAt: -1 }, // Sort by createdAt in descending order (latest first)
    },
    {
      $project: {
        id: '$_id', // Rename _id to id for the order
        orderNumber: 1,
        totalPrice: 1,
        status: 1,
        deliveryTimeRange: 1,
        fromAddress: {
          $cond: {
            if: { $not: ['$fromAddress'] }, // If fromAddress (FulfillmentCenter) is empty
            then: null, // Set it to null
            else: {
              id: '$fromAddress.id',
              name: '$fromAddress.name',
              coordinates: '$fromAddress.coordinates',
              floor: '$fromAddress.floor',
              appartment: '$fromAddress.appartment',
              addressDetails: '$fromAddress.addressDetails',
              addressPhoneNumber: '$fromAddress.addressPhoneNumber',
              description: '$fromAddress.description',
            },
          },
        },
        deliveryPartner: {
          $cond: {
            if: { $not: ['$deliveryPartner'] }, // If deliveryPartner is empty
            then: null, // Set it to null
            else: {
              id: '$deliveryPartner._id',
              firstName: '$deliveryPartner.firstName',
              lastName: '$deliveryPartner.lastName',
              phone: '$deliveryPartner.phoneNumber', // Assuming the delivery partner has a 'phone' field
              email: '$deliveryPartner.email', // Assuming delivery partner has an email
            },
          },
        },
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
    {
      $match: {
        user: userId,
        status: { $ne: 'failed' } // Exclude orders with failed status
      }
    },
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
        'This order cannot be cancelled because it has already been delivered or is being processed',
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
  order.status = 'cancelled';
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
  const currentUser = req.user; // User information from the request

  // Find the order by ID
  const order = await Order.findById(id).populate('fromAddress').populate({
    path: 'deliveryPartner',
    select: 'firstName lastName phoneNumber email',
  });

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  const currentStatus = order.status;

  // Ensure valid status transitions and role-based checks
  if (
    currentUser.role === 'delivery-partner' &&
    newStatus === 'out-for-delivery'
  ) {
    if (currentStatus !== 'ready-for-delivery') {
      return next(
        new AppError(
          'You can only change the status to out-for-delivery from ready-for-delivery',
          400,
        ),
      );
    }
    if (
      order.deliveryPartner &&
      !order.deliveryPartner.equals(currentUser._id)
    ) {
      return next(
        new AppError(
          'This order is already assigned to another delivery partner',
          403,
        ),
      );
    }
    if (!order.deliveryPartner) {
      order.deliveryPartner = currentUser._id;
    }
  } else if (
    newStatus === 'out-for-delivery' &&
    currentUser.role !== 'delivery-partner'
  ) {
    return next(new AppError('You are not a delivery partner.', 403));
  } else if (
    newStatus === 'ready-for-delivery' &&
    currentUser.role === 'delivery-partner'
  ) {
    if (currentStatus !== 'out-for-delivery') {
      return next(
        new AppError(
          'You can only change the status back to ready-for-delivery from out-for-delivery',
          400,
        ),
      );
    }
    order.deliveryPartner = undefined;
  } else {
    if (currentStatus === 'delivered' && newStatus !== 'cancelled') {
      return next(
        new AppError('Cannot update the status of a delivered order', 400),
      );
    }
  }

  // Fetch the user and their device tokens
  const user = await User.findById(order.user);
  const userDeviceTokens = user.deviceTokens || [];
  console.log(`User: ${user.email}, Device Tokens: ${userDeviceTokens}`);

  const validTokens = [];

  for (const token of userDeviceTokens) {
    try {
      await sendNotification(
        token,
        'Order status changed!',
        `Your order status has changed to ${newStatus}.`,
      );
      validTokens.push(token); // Add valid tokens
    } catch (err) {
      console.error(`Error sending notification to token ${token}:`, err);

      if (
        err.errorInfo?.code === 'messaging/registration-token-not-registered'
      ) {
        console.log(`Removing invalid token: ${token}`);
      } else {
        console.log(`Token ${token} failed for other reasons, keeping it.`);
        validTokens.push(token); // Keep other failing tokens
      }
    }
  }

  // Update the user's deviceTokens with only valid tokens
  user.deviceTokens = validTokens;
  await user.save();

  // Update the order status and status history
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

// Add a new function to handle payment confirmation
const confirmOrderPayment = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId);
  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  if (order.paymentStatus === 'paid') {
    return next(new AppError('Order is already paid', 400));
  }

  try {
    // Verify the payment intent status directly from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      order.paymentStatus = 'paid';
      order.status = 'pending';
      order.statusHistory.push({
        status: 'pending',
        changedAt: new Date()
      });
      await order.save();

      res.status(200).json({
        status: 'success',
        message: 'Payment confirmed successfully',
        order,
      });
    } else {
      return next(new AppError(`Payment not successful. Status: ${paymentIntent.status}`, 400));
    }
  } catch (error) {
    return next(new AppError('Error confirming payment: ' + error.message, 400));
  }
});

// Add new function to initiate payment
const initiatePayment = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;

  // Find the order
  const order = await Order.findById(orderId);
  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  // Verify order belongs to user
  if (order.user.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized to access this order', 403));
  }

  // Check if payment is already processed
  if (order.paymentStatus === 'paid') {
    return next(new AppError('Order is already paid', 400));
  }

  try {
    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.totalPrice * 100),
      currency: 'usd',
      metadata: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber
      },
      payment_method_types: ['card'],
      automatic_payment_methods: { enabled: false } // Explicitly disable automatic payment methods
    });

    // Update order with payment intent ID
    order.paymentIntentId = paymentIntent.id;
    await order.save();

    // Return the payment details
    res.status(200).json({
      status: 'success',
      paymentIntent: {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
      }
    });
  } catch (error) {
    return next(new AppError('Error creating payment: ' + error.message, 400));
  }
});

// Add this new function to orderController.js
const cancelOrderByPaymentIntent = catchAsync(async (req, res, next) => {
  const { paymentIntentId } = req.params;

  // Find order by payment intent ID
  const order = await Order.findOne({ paymentIntentId });

  if (!order) {
    return next(new AppError('No order found with that payment intent ID', 404));
  }

  // Verify that the order belongs to the requesting user
  if (order.user.toString() !== req.user._id.toString()) {
    return next(new AppError('You are not authorized to cancel this order', 403));
  }

  // Check if order is in a cancellable state
  if (['delivered', 'cancelled', 'failed'].includes(order.status)) {
    return next(new AppError(`Order cannot be cancelled because it is ${order.status}`, 400));
  }

  try {
    // Cancel the payment intent in Stripe
    await stripe.paymentIntents.cancel(paymentIntentId);

    // Update order status
    order.status = 'cancelled';
    order.paymentStatus = 'cancelled';
    order.statusHistory.push({
      status: 'cancelled',
      changedAt: new Date()
    });

    // Restore cart items
    const cart = await Cart.create({
      user: order.user,
      items: order.items.map(item => ({
        product: item.product,
        quantity: item.quantity
      }))
    });

    // Save the cart (total price will be calculated by pre-save middleware)
    await cart.save();

    // Restore product inventory
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { stock: item.quantity } }
      );
    }

    // Save the order
    await order.save();

    res.status(200).json({
      status: 'success',
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    return next(new AppError(`Error cancelling order: ${error.message}`, 400));
  }
});

const calculateChargesAndDiscountAPI = catchAsync(async (req, res, next) => {
  const { promoCode } = req.body;
  const userId = req.user.id;

  // Retrieve the user's cart
  const cart = await Cart.findOne({ user: userId }).populate('items.product');
  if (!cart || cart.items.length === 0) {
    return next(new AppError('Your cart is empty', 400));
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

  // Calculate charges and discount using the utility function
  const charges = await calculateChargesAndDiscount(userId, cart, promoCode, deliveryAddress, nearestFulfillmentCenter);

  res.status(200).json({
    status: 'success',
    charges: {
      productTotal: charges.productTotalPrice,
      deliveryFee: charges.deliveryFee,
      serviceFee: charges.serviceFee,
    },
    discount: charges.discount,
    originalAmount: charges.originalAmount,
    newAmount: charges.newAmount,
  });
});

const getAdminDashboardMetrics = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  // Default to the last 7 days if no date range is provided
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  // Set the end date to the end of the day to include all orders of that day
  end.setHours(23, 59, 59, 999);

  // Calculate the previous period
  const previousStart = new Date(start);
  const previousEnd = new Date(end);

  // Calculate the length of the current period in milliseconds
  const periodLength = end - start;

  // Subtract the period length from the current start and end dates
  // This shifts the current period back by its own length to create the previous period
  previousStart.setTime(start.getTime() - periodLength);
  previousEnd.setTime(end.getTime() - periodLength);

  // Helper function to calculate percentage increase
  const calculatePercentageIncrease = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  // Use aggregation pipeline to calculate current and previous metrics
  const [currentMetrics, previousMetrics] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: start,
            $lte: end,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalPrice' },
          totalOrders: { $sum: 1 },
          customers: { $addToSet: '$user' },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
          totalOrders: 1,
          totalCustomers: { $size: '$customers' },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: previousStart,
            $lte: previousEnd,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalPrice' },
          totalOrders: { $sum: 1 },
          customers: { $addToSet: '$user' },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
          totalOrders: 1,
          totalCustomers: { $size: '$customers' },
        },
      },
    ]),
  ]);

  const current = currentMetrics[0] || { totalRevenue: 0, totalOrders: 0, totalCustomers: 0 };
  const previous = previousMetrics[0] || { totalRevenue: 0, totalOrders: 0, totalCustomers: 0 };

  // Calculate percentage increases
  const totalRevenueIncrease = calculatePercentageIncrease(current.totalRevenue, previous.totalRevenue);
  const totalOrdersIncrease = calculatePercentageIncrease(current.totalOrders, previous.totalOrders);
  const totalCustomersIncrease = calculatePercentageIncrease(current.totalCustomers, previous.totalCustomers);

  // Calculate sales by fulfillment center for current and previous periods
  const [storeSales, previousStoreSales] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: start,
            $lte: end,
          },
        },
      },
      {
        $group: {
          _id: '$fromAddress', // Group by fulfillment center
          storeRevenue: { $sum: '$totalPrice' },
          totalOrders: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'fulfillmentcenters',
          localField: '_id',
          foreignField: '_id',
          as: 'storeDetails',
        },
      },
      {
        $unwind: '$storeDetails',
      },
      {
        $project: {
          _id: 0,
          storeId: '$_id',
          storeName: '$storeDetails.name',
          storeRevenue: 1,
          totalOrders: 1,
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: previousStart,
            $lte: previousEnd,
          },
        },
      },
      {
        $group: {
          _id: '$fromAddress',
          storeRevenue: { $sum: '$totalPrice' },
        },
      },
    ]),
  ]);

  // Calculate total store revenue for current and previous periods
  const totalStoreRevenue = storeSales.reduce((sum, store) => sum + store.storeRevenue, 0);
  const previousTotalStoreRevenue = previousStoreSales.reduce((sum, store) => sum + store.storeRevenue, 0);
  const totalStoreRevenueIncrease = calculatePercentageIncrease(totalStoreRevenue, previousTotalStoreRevenue);

  res.status(200).json({
    status: 'success',
    data: {
      totalRevenue: {
        count: current.totalRevenue,
        percentageIncrease: totalRevenueIncrease,
      },
      totalOrders: {
        count: current.totalOrders,
        percentageIncrease: totalOrdersIncrease,
      },
      totalCustomers: {
        count: current.totalCustomers,
        percentageIncrease: totalCustomersIncrease,
      },
      storeSales: {
        totalStoreRevenue: {
          count: totalStoreRevenue,
          percentageIncrease: totalStoreRevenueIncrease,
        },
        details: storeSales,
      },
    },
  });
});

const getTopSellingProducts = catchAsync(async (req, res, next) => {
  const { startDate, endDate, page = 1, limit = 10 } = req.query;

  // Convert startDate and endDate to Date objects, or use defaults
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
  const end = endDate ? new Date(endDate) : new Date();

  // Set the end date to the end of the day to include all orders of that day
  end.setHours(23, 59, 59, 999);

  const skip = (page - 1) * limit;

  const result = await Order.aggregate([
    // Match orders within the specified date range
    {
      $match: {
        createdAt: {
          $gte: start,
          $lte: end,
        },
      },
    },
    // Unwind the items array to process each item individually
    { $unwind: '$items' },
    // Group by product ID and calculate total quantity
    {
      $group: {
        _id: '$items.product',
        totalQuantity: { $sum: '$items.quantity' },
      },
    },
    // Lookup to get product details, including price and category
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'productDetails',
      },
    },
    // Unwind the product details array
    { $unwind: '$productDetails' },
    // Lookup to get category details if category is stored as an ID
    {
      $lookup: {
        from: 'productcategories', // Ensure this matches the actual collection name
        localField: 'productDetails.productCategory',
        foreignField: '_id',
        as: 'categoryDetails',
      },
    },
    // Unwind the category details array
    { $unwind: '$categoryDetails' },
    // Calculate total sales using the product price
    {
      $addFields: {
        totalSales: { $multiply: ['$totalQuantity', '$productDetails.price'] },
      },
    },
    // Sort by total sales in descending order
    { $sort: { totalSales: -1 } },
    // Facet to handle pagination and total count
    {
      $facet: {
        metadata: [{ $count: 'totalItems' }],
        data: [
          { $skip: skip },
          { $limit: parseInt(limit) },
          // Project the required fields
          {
            $project: {
              _id: 0,
              productId: '$_id', // Include productId
              image: '$productDetails.image',
              name: '$productDetails.name',
              category: '$categoryDetails.name', // Include category name
              totalSales: 1,
            },
          },
        ],
      },
    },
    // Unwind metadata to get totalItems
    { $unwind: '$metadata' },
    // Add totalPages to metadata
    {
      $addFields: {
        'metadata.totalPages': {
          $ceil: { $divide: ['$metadata.totalItems', parseInt(limit)] },
        },
      },
    },
  ]);

  const topSellingProducts = result[0].data;
  const pageInfo = {
    page: parseInt(page),
    limit: parseInt(limit),
    totalItems: result[0].metadata.totalItems,
    totalPages: result[0].metadata.totalPages,
  };

  res.status(200).json({
    status: 'success',
    data: topSellingProducts,
    pageInfo,
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
  reorder,
  getAdditionalCharges,
  confirmOrderPayment,
  initiatePayment,
  cancelOrderByPaymentIntent,
  calculateChargesAndDiscountAPI,
  getAdminDashboardMetrics,
  getTopSellingProducts
};
