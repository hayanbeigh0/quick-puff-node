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
    role: {
      type: String,
      default: 'user',
    },
    photoIdUrl: {
      type: String,
    },
    idVerificationStatus: {
      type: String,
      enum: ['pending', 'initiated', 'verified', 'rejected'],
      default: 'pending',
    },
    idVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    idVerificationDate: {
      type: Date,
    },
    idVerificationComment: {
      type: String,
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
    deviceTokens: {
      type: [String],
    },
    deliveryAddressLocations: [deliveryAddressLocationSchema],
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

// Prevent operations on inactive users
userSchema.pre('save', function (next) {
  if (!this.active) {
    const error = new Error('User is inactive and cannot be saved.');
    return next(error);
  }

  if (this.firstName && this.lastName && this.phoneNumber && this.dateOfBirth) {
    this.profileCompleted = true;
  } else {
    this.profileCompleted = false;
  }
  next();
});

userSchema.pre(/^find/, async function (next) {
  this.find({ active: { $ne: false } });
  next();
});

userSchema.pre('findOneAndUpdate', function (next) {
  if (this._update.active === false) {
    const error = new Error('Cannot update to inactive user.');
    return next(error);
  }
  next();
});

userSchema.pre('remove', function (next) {
  if (!this.active) {
    const error = new Error('Cannot delete an inactive user.');
    return next(error);
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
