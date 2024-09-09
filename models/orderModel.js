const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
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
        },
      },
    ],
    deliveryAddress: {
      type: String,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash_on_delivery', 'credit_card'],
      required: true,
    },
    tipAmount: {
      type: Number,
      default: 0,
    },
    promoCode: String,
    totalPrice: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['Processing', 'Delivered', 'Cancelled'],
      default: 'Processing',
    },
    createdAt: {
      type: Date,
      default: Date.now,
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

const Order = mongoose.model('Order', orderSchema);
