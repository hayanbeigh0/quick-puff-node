const mongoose = require('mongoose');

const fulfillmentCenterSchema = new mongoose.Schema(
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
  },
  {
    timestamps: true,
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

fulfillmentCenterSchema.index({ coordinates: '2dsphere' }); // Geospatial index

const FulfillmentCenter = mongoose.model(
  'FulfillmentCenter',
  fulfillmentCenterSchema,
);

module.exports = FulfillmentCenter;
