const mongoose = require('mongoose');

const serviceableLocationSchema = new mongoose.Schema(
  {
    zipCode: { type: Number, required: [true, 'Zip code is required!'] },
    countryCode: {
      type: String,
      required: [true, 'Country code is required!'],
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

serviceableLocationSchema.index(
  { zipCode: 1, countryCode: 1 },
  { unique: true },
);

const ServiceableLocation = mongoose.model(
  'ServiceableLocation',
  serviceableLocationSchema,
);

module.exports = ServiceableLocation;
