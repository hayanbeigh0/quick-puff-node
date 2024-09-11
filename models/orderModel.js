const mongoose = require('mongoose');

const deliveryAddressLocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      default: 'Point',
      enum: ['Point'],
    },
    coordinates: {
      type: [Number],
    },
    floor: String,
    appartment: String,
    addressDetails: String,
    addressPhoneNumber: String,
    description: String,
    default: {
      type: Boolean,
      default: false,
      required: [true, 'A User must have a default delivery address'],
    },
  },
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
    deliveryAddress: deliveryAddressLocationSchema,
    paymentMethod: {
      type: String,
      enum: ['cash_on_delivery', 'credit_card_on_delivery', 'credit_card'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },
    transactionId: String,
    tipAmount: {
      type: Number,
      default: 0,
    },
    promoCode: String,
    totalPrice: {
      type: Number,
      required: true,
    },
    serviceFee: {
      type: Number,
      default: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
    },
    orderNumber: {
      type: String,
      required: true,
    },
    deliveryTimeRange: {
      type: String,
      required: true,
    },
    trackingNumber: String,
    status: {
      type: String,
      enum: ['pending', 'processing', 'delivered', 'canceled'],
      default: 'pending',
    },
    statusHistory: [
      {
        status: String,
        changedAt: Date,
      },
    ],
    deliveredAt: Date,
    orderNotes: String,
  },
  { timestamps: true },
  {
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  },
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
