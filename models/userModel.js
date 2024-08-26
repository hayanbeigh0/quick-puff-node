const mongoose = require('mongoose');
const validator = require('validator');

const userSchema = mongoose.Schema(
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
    verificationCode: String,
    verificationCodeExpires: Date,
    photo: {
      type: String,
      trim: true,
    },
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
  console.log('logging the user')
  if (this.firstName && this.lastName && this.phoneNumber && this.dateOfBirth) {
    console.log('setting true')
    this.profileCompleted = true;
    return next();
  }
  console.log('setting false')

  this.profileCompleted = false;
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
