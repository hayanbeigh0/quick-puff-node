const ErrorLog = require('../models/errorLogModel');
const AppError = require('../utils/appError');

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};
const handleDuplicateFieldsDB = (err) => {
  const value = err.message.match(/(["'])(?:(?=(\\?))\2.)*?\1/)[0];
  console.log(value);
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data: ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = (_) =>
  new AppError('Invalid token! Please login again.', 401);

const handleJWTExpiredError = (_) =>
  new AppError('Your token has expired! Please login again.', 401);

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    stack: err.stack,
    error: err,
    code: err.errorCode,
  });
};
const sendErrorProd = async (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      code: err.errorCode,
    });
    // Programming or other unknown error: don't leak error details
  } else {
    // 1.) Log error
    console.error('ERROR:❗️', err);

    try {
      // Save error to the database
      const errorLog = new ErrorLog({
        message: err.message,
        stack_trace: err.stack, // Stack trace of the error
        request_url: res.req.originalUrl, // URL where the error occurred
        request_method: res.req.method, // HTTP method (GET, POST, etc.)
        user_id: res.user ? res.user._id : null, // Optional: Log the user if applicable
        ip_address: res.req.ip, // IP address of the client
      });

      // Save the log asynchronously (you can add `await` if you're using `async`/`await`)
      await errorLog.save();
    } catch (dbError) {
      console.error('Error logging to the database:', dbError);
    }
    // 2) Send generic message
    res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    console.log(err);
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === 'production') {
    console.log(err);
    let error = Object.assign(err);
    if (error.name === 'CastError') {
      error = handleCastErrorDB(error);
    }
    if (error.code === 11000) {
      error = handleDuplicateFieldsDB(error);
    }
    if (error.name === 'ValidationError') {
      error = handleValidationErrorDB(error);
    }
    if (error.name === 'JsonWebTokenError') {
      error = handleJWTError(error);
    }
    if (error.name === 'TokenExpiredError') {
      error = handleJWTExpiredError(error);
    }
    sendErrorProd(error, res);
  }
};
