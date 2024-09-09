const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
    totalPrice: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
  {
    _id: true, // Ensure _id is created for each subdocument
    id: true, // Create a virtual 'id' field from '_id'
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
      },
    },
  },
);

cartSchema.methods.calculateTotalPrice = async function () {
  // Populating the product details to access the price
  await this.populate('items.product').execPopulate();

  // Calculate total price by summing up the price of each product times its quantity
  let total = 0;

  this.items.forEach((item) => {
    const productPrice = item.product.price || 0; // Fallback to 0 if price not set
    total += productPrice * item.quantity;
  });

  // Set the total price for the cart
  this.totalPrice = total;

  // Return the total price
  return this.totalPrice;
};

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
