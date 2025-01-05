const express = require('express');

const authController = require('../controllers/authController');
const feedbackController = require('../controllers/feedbackController');

const router = express.Router();
router.use(authController.protect);

router
  .route('/')
  .post(feedbackController.createFeedback)
  .get(feedbackController.getFeedbacks);

router
  .route('/:id')
  .get(feedbackController.getFeedback)
  .patch(feedbackController.updateFeedback)
  .delete(feedbackController.deleteFeedback);

module.exports = router;
