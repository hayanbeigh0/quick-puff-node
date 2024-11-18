const Feedback = require('../models/feedbackModel');
const factory = require('./handlerFactory');

const createFeedback = (req, res, next) => {
  // Set user ID from req.user.id
  if (req.user.id) req.body.user = req.user.id;

  // Call the factory method to create feedback
  return factory.createOne(Feedback)(req, res, next);
};

const updateFeedback = factory.updateOne(Feedback);

const getFeedbacks = (req, res, next) => {
  // Optional filtering by user ID
  if (req.user.id) req.query.user = req.user.id;

  // Call the factory method to get all feedbacks
  return factory.getAll(Feedback)(req, res, next);
};

const getFeedback = factory.getOne(Feedback); // No additional modifications needed

const deleteFeedback = factory.deleteOne(Feedback); // No additional modifications needed

module.exports = {
  createFeedback,
  updateFeedback,
  getFeedback,
  getFeedbacks,
  deleteFeedback,
};
