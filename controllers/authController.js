const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');
const User = require('./../models/userModel');
const AppError = require('../utils/appError');
const { OAuth2Client } = require('google-auth-library');
const { sendEmail, loginCodeMailgenContent } = require('../utils/email');
const crypto = require('crypto');
const appleSigninAuth = require('apple-signin-auth');

const createAndSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === 'production') {
    cookieOptions.secure = true;
  }
  res.cookie('jwt', token, cookieOptions);

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google Sign-In
exports.googleSignIn = catchAsync(async (req, res, next) => {
  const { idToken } = req.body;

  if (!idToken) {
    return next(new AppError('No Google ID token provided!', 400));
  }

  // 1) Verify the ID token
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    return next(new AppError('Invalid Google token!', 401));
  }
  console.log(payload);

  const { email, name, sub: googleId } = payload;

  // 2) Check if the user already exists
  let user = await User.findOne({ email });

  if (!user) {
    // 3) If user does not exist, create a new user
    user = await User.create({
      name,
      email,
      googleId,
    });
  } else if (!user.googleId) {
    // If the user exists but doesn't have a Google ID, attach it
    user.googleId = googleId;
    await user.save({ validateBeforeSave: false });
  }

  // 4) Create and send token
  createAndSendToken(user, 200, res);
});

// Apple Sign-In
exports.appleSignIn = catchAsync(async (req, res, next) => {
  const { idToken, email, fullName } = req.body;

  if (!idToken) {
    return next(new AppError('No Apple ID token provided!', 400));
  }

  let appleUser;
  try {
    appleUser = await appleSigninAuth.verifyIdToken(idToken, {
      audience: process.env.APPLE_CLIENT_ID,
      ignoreExpiration: false,
    });
  } catch (error) {
    return next(new AppError('Invalid Apple token!', 401));
  }

  const { sub: appleId } = appleUser;

  // Check if the user already exists
  let user = await User.findOne({ appleId });

  if (!user) {
    // If the user does not exist, create a new user
    user = await User.create({
      name: fullName,
      email,
      appleId,
    });
  }

  // Create and send token
  createAndSendToken(user, 200, res);
});

exports.signupOrSigninWithEmail = catchAsync(async (req, res, next) => {
  const { email, name } = req.body;

  if (!email) {
    return next(new AppError('No email provided!', 400));
  }

  // Check if the user already exists
  let user = await User.findOne({ email });

  if (!user) {
    // Create a new user
    user = await User.create({ email, name });
  }

  // Generate a 4-digit verification code
  const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();
  const hashedVerificationCode = crypto
    .createHash('sha256')
    .update(verificationCode)
    .digest('hex');

  // Save the verification code and expiration to the user document
  user.verificationCode = hashedVerificationCode;
  user.verificationCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes expiration

  await user.save();

  try {
    await sendEmail({
      email: user.email,
      subject: 'Your authentication code for login',
      mailgenContent: loginCodeMailgenContent(user.name, verificationCode),
    });

    res.status(200).json({
      status: 'success',
      message: 'Verification code sent to email!',
    });
  } catch (e) {
    console.log(e);
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        'There was an error sending an email. Try again later!',
        500,
      ),
    );
  }
});

exports.verifyAuthCode = catchAsync(async (req, res, next) => {
  const { verificationCode, email } = req.body;

  // Find the user with the given verification code
  const user = await User.findOne({
    // verificationCode: verificationCode,
    email: email,
    verificationCodeExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError('Invalid or expired verification code!', 400));
  }

  const candidateHashCode = crypto
    .createHash('sha256')
    .update(`${verificationCode}`)
    .digest('hex');

  // Compare candidate hash code with hash store in db
  if (candidateHashCode !== user.verificationCode)
    return next(new AppError('Invalid verification code', 401));

  // Clear the verification code and expiration
  user.verificationCode = undefined;
  user.verificationCodeExpires = undefined;
  await user.save();

  // Create and send token
  createAndSendToken(user, 200, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting the token and check if it exists.
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    next(
      new AppError('You are not logged in! Please login to get access.', 401),
    );
  }
  // 2) Check if the token is valid.
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  // 3) Check if the user still exists.
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError('The user belonging to the token does not exist!', 401),
    );
  }
  // // 4) Check if user changed password after the token was generated
  // if (currentUser.changedPasswordAfter(decoded.iat)) {
  //   next(
  //     new AppError('User recently changed password! Please login again.', 401),
  //   );
  // }

  // Grant access to the protected route
  req.user = currentUser;
  next();
});

exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403),
      );
    }
    next();
  };