const mongoose = require('mongoose');

const flavorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
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


const Flavor = mongoose.model('Flavor', flavorSchema);

module.exports = Flavor;
