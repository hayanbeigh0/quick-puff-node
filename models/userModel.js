const mongoose = require('mongoose');
const validator = require('validator');

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

// Define the user schema
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'A User must have an email'],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, 'Please provide a valid email'],
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
    },
    profileCompleted: {
      type: Boolean,
      required: true,
      default: false,
    },
    idVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    verificationCode: String,
    verificationCodeExpires: Date,
    photo: {
      type: String,
      trim: true,
    },
    deliveryAddressLocations: [deliveryAddressLocationSchema], // Use the subdocument schema
    active: { type: Boolean, default: true, select: false },
  },
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

userSchema.index({ organisations: 1 });
userSchema.index({ name: 1 });

userSchema.pre(/^find/, async function (next) {
  this.find({ active: { $ne: false } });
  next();
});

userSchema.pre('save', function (next) {
  if (this.firstName && this.lastName && this.phoneNumber && this.dateOfBirth) {
    this.profileCompleted = true;
    return next();
  }

  this.profileCompleted = false;
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
