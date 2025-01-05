const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');
const User = require('./../models/userModel');
const AppError = require('../utils/appError');
const { OAuth2Client } = require('google-auth-library');
const { sendEmail, loginCodeMailgenContent } = require('../utils/email');
const crypto = require('crypto');
const appleSigninAuth = require('apple-signin-auth');
const ErrorCodes = require('../utils/appErrorCodes');
const { updateDeviceToken } = require('./userController');

const createAndSendToken = async (user, statusCode, res, deviceToken) => {
  const token = signToken(user._id);

  // Update the device token if provided
  // if (deviceToken) {
  //   console.log(deviceToken);
  //   if (!user.deviceTokens.includes(deviceToken)) {
  //     user.deviceTokens.push(deviceToken);
  //     await user.save({ validateBeforeSave: false });
  //   }
  // }

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
  const { idToken, deviceToken } = req.body;

  if (!idToken) {
    return next(
      new AppError(
        'No Google ID token provided!',
        400,
        ErrorCodes.NO_GOOGLE_ID_TOKEN_PROVIDED.code,
      ),
    );
  }

  // Verify Google ID token
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    return next(
      new AppError(
        'Invalid Google token!',
        401,
        ErrorCodes.INVALID_GOOGLE_ID.code,
      ),
    );
  }

  const { email, name, sub: googleId } = payload;

  // Check if the user already exists
  let user = await User.findOne({ email });

  if (!user) {
    // Create new user
    user = await User.create({
      name,
      email,
      googleId,
    });
  } else if (!user.googleId) {
    // Attach Google ID if missing
    user.googleId = googleId;
    await user.save({ validateBeforeSave: false });
  }

  // Create and send token, include device token
  await createAndSendToken(user, 200, res, deviceToken);
});

// Apple Sign-In
exports.appleSignIn = catchAsync(async (req, res, next) => {
  const { idToken, email: reqEmail, fullName, deviceToken } = req.body;

  if (!idToken) {
    return next(
      new AppError(
        'No Apple ID token provided!',
        400,
        ErrorCodes.NO_APPLE_ID_TOKEN_PROVIDED.code,
      ),
    );
  }

  let appleUser;
  try {
    // Verify Apple ID token
    appleUser = await appleSigninAuth.verifyIdToken(idToken, {
      audience: process.env.APPLE_CLIENT_ID,
      ignoreExpiration: false,
    });
  } catch (error) {
    return next(
      new AppError(
        'Invalid Apple token!',
        401,
        ErrorCodes.INVALID_APPLE_ID.code,
      ),
    );
  }

  const { sub: appleId, email: appleEmail } = appleUser;
  const email = appleEmail || reqEmail;

  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      name: fullName,
      email,
      appleId,
    });
  }

  await createAndSendToken(user, 200, res, deviceToken);
});

exports.signupOrSigninWithEmail = catchAsync(async (req, res, next) => {
  const { email, name } = req.body;

  if (!email) {
    return next(
      new AppError(
        'No email provided!',
        400,
        ErrorCodes.NO_EMAIL_PROVIDED.code,
      ),
    );
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
      subject: 'Your verification code for login',
      mailgenContent: loginCodeMailgenContent(user.name, verificationCode),
    });
    console.log(email, verificationCode);

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
        ErrorCodes.EMAIL_SENDING_ERROR.code,
      ),
    );
  }
});

exports.verifyAuthCode = catchAsync(async (req, res, next) => {
  const { verificationCode, email, deviceToken } = req.body;

  const queryOptions = {
    email,
  };

  if (email !== 'test@example.com') {
    queryOptions.verificationCodeExpires = { $gt: Date.now() };
  }

  // Find the user with the given verification code
  const user = await User.findOne(queryOptions);

  // Special case for test accounts
  if (user && user.email === 'test@example.com' && verificationCode === 8888) {
    if (deviceToken && !user.deviceTokens.includes(deviceToken)) {
      user.deviceTokens.push(deviceToken);
      await user.save();
    }
    createAndSendToken(user, 200, res);
    return;
  }

  // If no user is found or code is invalid
  if (!user) {
    return next(
      new AppError(
        'Invalid or expired verification code!',
        400,
        ErrorCodes.INVALID_OR_EXPIRED_VERIFICATION_CODE.code,
      ),
    );
  }

  // Verify the provided code
  const candidateHashCode = crypto
    .createHash('sha256')
    .update(`${verificationCode}`)
    .digest('hex');

  if (candidateHashCode !== user.verificationCode) {
    return next(
      new AppError(
        'Invalid verification code',
        401,
        ErrorCodes.INVALID_VERIFICATION_CODE.code,
      ),
    );
  }

  // Clear the verification code and expiration
  user.verificationCode = undefined;
  user.verificationCodeExpires = undefined;

  // Add the device token if it is provided and not already in the user's record
  if (deviceToken && !user.deviceTokens.includes(deviceToken)) {
    user.deviceTokens.push(deviceToken);
  }

  await user.save();

  // Create and send token
  createAndSendToken(user, 200, res, deviceToken);
});

exports.logout = catchAsync(async (req, res, next) => {
  const { deviceToken } = req.body;

  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError('No user found with that id', 400));
  }

  // Remove device token
  user.deviceTokens = user.deviceTokens.filter(
    (token) => token !== deviceToken,
  );
  await user.save();

  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully!',
  });
});

exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return next(
      new AppError(
        'You are not logged in! Please login to get access.',
        401,
        ErrorCodes.NOT_LOGGED_IN.code,
      ),
    );
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to the token does not exist!',
        401,
        ErrorCodes.NO_USER_BELONGING_TO_TOKEN.code,
      ),
    );
  }

  req.user = currentUser;

  // Update device token
  // if (req.body.deviceToken) {
  //   updateDeviceToken(req, res);
  // }

  next();
});

exports.getUser = catchAsync(async (req, res, next) => {
  // 1) Getting the token and check if it exists.
  let token;
  if (!req.headers.authorization) {
    return next();
  }
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    next(
      new AppError(
        'You are not logged in! Please login to get access.',
        401,
        ErrorCodes.NOT_LOGGED_IN.code,
      ),
    );
  }
  // 2) Check if the token is valid.
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  // 3) Check if the user still exists.
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to the token does not exist!',
        401,
        ErrorCodes.NO_USER_BELONGING_TO_TOKEN.code,
      ),
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

exports.deviceToken = catchAsync(async (req, res, next) => {
  // 1) Getting the token and check if it exists.
  let token;
  if (!req.headers.authorization) {
    return next();
  }
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    next(
      new AppError(
        'You are not logged in! Please login to get access.',
        401,
        ErrorCodes.NOT_LOGGED_IN.code,
      ),
    );
  }
  // 2) Check if the token is valid.
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  // 3) Check if the user still exists.
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to the token does not exist!',
        401,
        ErrorCodes.NO_USER_BELONGING_TO_TOKEN.code,
      ),
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
