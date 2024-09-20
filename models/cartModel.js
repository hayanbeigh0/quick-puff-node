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
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        // Replace _id with id at the top level
        ret.id = ret._id;
        delete ret._id;

        // Transform each item in the items array to replace _id with id
        if (ret.items) {
          ret.items = ret.items.map((item) => {
            item.id = item._id;
            delete item._id;
            return item;
          });
        }

        // If products in items have _id, replace them with id too
        if (ret.items && ret.items.length > 0) {
          ret.items.forEach((item) => {
            if (item.product && item.product._id) {
              item.product.id = item.product._id;
              delete item.product._id;
            }
          });
        }
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        // Replace _id with id at the top level
        ret.id = ret._id;
        delete ret._id;

        // Transform each item in the items array to replace _id with id
        if (ret.items) {
          ret.items = ret.items.map((item) => {
            item.id = item._id;
            delete item._id;
            return item;
          });
        }

        // If products in items have _id, replace them with id too
        if (ret.items && ret.items.length > 0) {
          ret.items.forEach((item) => {
            if (item.product && item.product._id) {
              item.product.id = item.product._id;
              delete item.product._id;
            }
          });
        }
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
