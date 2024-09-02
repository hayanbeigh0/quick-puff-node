const mongoose = require("mongoose");
const AppError = require("../utils/appError");

module.exports = (fn) => {
  return async (req, res, next) => {
    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      await fn(req, res, next, session);
      await session.commitTransaction();
      session.endSession();
    } catch (err) {
      if (session) {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          console.log("Error aborting transaction:", abortError);
        }
        session.endSession();
      }
      next(new AppError(err, 404));
    }
  };
};
