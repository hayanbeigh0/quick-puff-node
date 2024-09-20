const Cart = require('../models/cartModel'); // Assuming the cart model is defined
const Product = require('../models/productModel'); // Assuming the product model is defined
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Helper function to find the user's cart or create one if it doesn't exist
const findOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
};

// Add item to cart
const addItemToCart = catchAsync(async (req, res, next) => {
  const { productId, quantity } = req.body;

  // Fetch the product to ensure it exists and has enough stock
  const product = await Product.findById(productId);
  if (!product) {
    return next(new AppError('Product not found', 404));
  }

  if (product.stock < quantity) {
    return next(new AppError('Not enough stock available', 400));
  }

  // Find or create the user's cart
  const cart = await findOrCreateCart(req.user._id);

  // Check if the product is already in the cart
  const existingItemIndex = cart.items.findIndex(
    (item) => item.product.toString() === productId,
  );

  if (existingItemIndex !== -1) {
    // If product exists, update the quantity
    cart.items[existingItemIndex].quantity += quantity;

    // Ensure stock availability after update
    if (cart.items[existingItemIndex].quantity > product.stock) {
      return next(new AppError('Not enough stock available', 400));
    }
  } else {
    // Add new product to the cart
    cart.items.push({ product: productId, quantity });
  }

  // Calculate total price before saving the cart
  await cart.calculateTotalPrice();

  await cart.save();

  res.status(200).json({
    status: 'success',
    cart,
  });
});

// Get the user's cart items
const getCart = catchAsync(async (req, res, next) => {
  // Find the cart by the user's ID
  const cart = await Cart.findOne({ user: req.user._id }).populate({
    path: 'items.product',
    select: 'name price image stock',
  });

  // If the user has no cart yet, return an empty cart
  if (!cart) {
    return res.status(200).json({
      status: 'success',
      cart: {
        items: [],
        totalPrice: 0,
      },
    });
  }

  res.status(200).json({
    status: 'success',
    cart,
  });
});

// Remove item from cart
const removeItemFromCart = catchAsync(async (req, res, next) => {
  const { productId } = req.params;

  // Find the user's cart
  const cart = await findOrCreateCart(req.user._id);

  // Remove the item from the cart
  cart.items = cart.items.filter(
    (item) => item.product.toString() !== productId,
  );

  // Calculate total price before saving the cart
  await cart.calculateTotalPrice();

  await cart.save();

  res.status(200).json({
    status: 'success',
    cart,
  });
});

// Update item quantity in the cart
const updateCartItemQuantity = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { quantity } = req.body;

  // Validate the quantity
  if (quantity <= 0) {
    return next(new AppError('Quantity must be greater than 0', 400));
  }

  // Fetch the product to check stock
  const product = await Product.findById(productId);
  if (!product) {
    return next(new AppError('Product not found', 404));
  }

  if (product.stock < quantity) {
    return next(new AppError('Not enough stock available', 400));
  }

  // Find the user's cart
  const cart = await findOrCreateCart(req.user._id);

  // Find the product in the cart
  const itemIndex = cart.items.findIndex(
    (item) => item.product.toString() === productId,
  );

  if (itemIndex === -1) {
    return next(new AppError('Product not found in cart', 404));
  }

  // Update the quantity
  cart.items[itemIndex].quantity = quantity;

  // Calculate total price before saving the cart
  await cart.calculateTotalPrice();

  await cart.save();

  res.status(200).json({
    status: 'success',
    cart,
  });
});

module.exports = {
  addItemToCart,
  getCart,
  removeItemFromCart,
  updateCartItemQuantity,
};
