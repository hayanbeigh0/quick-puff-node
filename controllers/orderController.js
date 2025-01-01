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

const createOrder = setTransaction(async (req, res, next, session) => {
  const userId = req.user._id;

  // 1. Retrieve user and check their age
  const user = await User.findById(userId).session(session);
  if (!user || !user.dateOfBirth) {
    return next(new AppError('User not found or missing date of birth', 400));
  }

  // if (!user.idVerified) {
  //   return next(
  //     new AppError(
  //       'User ID not verified!',
  //       400,
  //       ErrorCodes.USER_ID_NOT_VERIFIED.code,
  //     ),
  //   );
  // }

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

  // 8. Estimate delivery time (assumed delivery speed of 40 km/h)
  const deliverySpeedKmPerHour = 40; // Example: constant speed of 40 km/h
  const estimatedDeliveryTimeHours = distance / deliverySpeedKmPerHour;

  // Convert hours to minutes
  const estimatedDeliveryTimeMinutes = Math.ceil(
    estimatedDeliveryTimeHours * 60,
  );

  const deliveryTimeRange = formatTimeRange(
    new Date(),
    estimatedDeliveryTimeMinutes,
  );

  // 9. Apply promo code discount (if applicable)
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

  // 10. Calculate the final total price including delivery and service fees
  let totalPrice = productTotalPrice + deliveryFee + serviceFee;

  // Generate order number
  const orderNumber = await generateUniqueOrderNumber();

  // Create the order without payment intent
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
      tipAmount: tipAmount,
      promoCode: promoCode,
      totalPrice: totalPrice,
      serviceFee: serviceFee,
      deliveryFee: deliveryFee,
      status: 'awaiting-payment',
      statusHistory: [{
        status: 'awaiting-payment',
        changedAt: new Date()
      }],
      deliveryTimeRange: deliveryTimeRange,
    }
  ], { session });

  // 14. Restore the inventory
  for (const item of cart.items) {
    await Product.findByIdAndUpdate(item.product._id, {
      $inc: { stock: -item.quantity },
    }).session(session);
  }

  // 15. Clear the cart after order creation
  await Cart.findOneAndDelete({ user: userId }).session(session);

  // Populate the product details, delivery partner, and from address in the newly created order
  const populatedOrder = await Order.findById(newOrder[0]._id)
    .populate('items.product') // Populate the product in the items list
    .populate('deliveryPartner') // Populate the delivery partner
    .populate('fromAddress') // Populate the from address
    .session(session);

  // Send the response with the new order details
  res.status(201).json({
    status: 'success',
    order: populatedOrder
  });
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
  const previousOrderId = req.params.orderId;

  // 1. Retrieve the previous order
  const previousOrder = await Order.findById(previousOrderId)
    .populate('items.product')
    .session(session);

  if (!previousOrder || previousOrder.user.toString() !== userId.toString()) {
    return next(new AppError('Order not found or you do not have permission to reorder it', 404));
  }

  // 2. Check the availability of each item and adjust the total price
  let productTotalPrice = 0;
  const newItems = [];
  for (const item of previousOrder.items) {
    const product = await Product.findById(item.product._id).session(session);

    if (!product || product.stock < item.quantity) {
      return next(new AppError(
        `Product ${item.product.name} is out of stock or insufficient stock`,
        400,
        ErrorCodes.OUT_OF_STOCK.code
      ));
    }

    const price = product.price;
    productTotalPrice += item.quantity * price;

    newItems.push({
      product: product._id,
      quantity: item.quantity,
    });
  }

  // 3. Retrieve the delivery address from the previous order
  const deliveryAddress = previousOrder.deliveryAddress;
  if (!deliveryAddress || !deliveryAddress.coordinates) {
    return next(new AppError('Invalid delivery address', 400));
  }

  // 4. Find nearest fulfillment center
  const MAX_DISTANCE_KM = 100000;
  const nearestFulfillmentCenter = await FulfillmentCenter.findOne({
    coordinates: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: deliveryAddress.coordinates,
        },
        $maxDistance: MAX_DISTANCE_KM * 1000,
      },
    },
  }).session(session);

  if (!nearestFulfillmentCenter) {
    return next(new AppError(
      'No fulfillment center available nearby',
      404,
      ErrorCodes.NO_NEAREST_FULLFILMENT_CENTER_FOUND.code
    ));
  }

  // 5. Calculate distance and fees
  const distance = calculateDistance(
    {
      latitude: deliveryAddress.coordinates[1],
      longitude: deliveryAddress.coordinates[0],
    },
    {
      latitude: nearestFulfillmentCenter.coordinates[1],
      longitude: nearestFulfillmentCenter.coordinates[0],
    }
  );

  const deliveryFee = DELIVERY_FEE_BASE + distance * 0.5;
  const serviceFee = SERVICE_FEE_BASE + (distance > 10 ? 2 : 0);

  // 6. Include tip amount
  const tipAmount = req.body.tipAmount || previousOrder.tipAmount || 0;
  productTotalPrice += tipAmount;

  if (productTotalPrice < MIN_DELIVERY_AMOUNT) {
    return next(new AppError(
      `Minimum order amount for delivery is $${MIN_DELIVERY_AMOUNT}`,
      400
    ));
  }

  // 7. Calculate total price
  let totalPrice = productTotalPrice + deliveryFee + serviceFee;

  // 8. Apply promo code if provided
  const promoCode = req.body.promoCode || null;
  if (promoCode) {
    const promo = await PromoCode.findOne({ code: promoCode });
    if (!promo || promo.expirationDate < Date.now()) {
      return next(new AppError('Promo code is invalid or expired', 400));
    }

    if (productTotalPrice < promo.minOrderValue) {
      return next(new AppError(
        `Minimum order value to apply this promo code is $${promo.minOrderValue}`,
        400,
        ErrorCodes.MIN_ORDER_AMOUNT_RESTRICTION.code
      ));
    }

    const discountAmount = promo.discountType === 'percentage'
      ? (productTotalPrice * promo.discountValue) / 100
      : promo.discountValue;

    totalPrice -= discountAmount;
  }

  // 9. Generate order number and delivery time range
  const orderNumber = await generateUniqueOrderNumber();
  const deliveryTimeRange = formatTimeRange(
    new Date(),
    Math.ceil((distance / 40) * 60) // 40 km/h speed
  );

  // 10. Create the new order
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
    totalPrice: totalPrice,
    serviceFee: serviceFee,
    deliveryFee: deliveryFee,
    status: 'awaiting-payment',
    statusHistory: [{
      status: 'awaiting-payment',
      changedAt: new Date()
    }],
    deliveryTimeRange: deliveryTimeRange,
  }], { session });

  // 11. Update product stock
  for (const item of newItems) {
    await Product.findByIdAndUpdate(
      item.product,
      { $inc: { stock: -item.quantity } }
    ).session(session);
  }

  // 12. Populate the order details
  const populatedOrder = await Order.findById(newOrder[0]._id)
    .populate('items.product')
    .populate('deliveryPartner')
    .populate('fromAddress')
    .session(session);

  // 13. Send response
  res.status(201).json({
    status: 'success',
    order: populatedOrder
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
        status: { $ne: 'failed' }, // Exclude failed orders
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
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Update order with payment intent ID
    order.paymentIntentId = paymentIntent.id;
    await order.save();

    // Return the payment details
    res.status(200).json({
      status: 'success',
      paymentIntent: {
        clientSecret: paymentIntent.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
      }
    });
  } catch (error) {
    return next(new AppError('Error creating payment: ' + error.message, 400));
  }
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
};
