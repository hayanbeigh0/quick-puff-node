const express = require('express');

const authController = require('../controllers/authController');
const userController = require('../controllers/userController');

const router = express.Router();

router.use(authController.protect, authController.restrictTo('admin'));

router
  .route('/pendingVerifications')
  .get(userController.getPendingVerifications);

router.route('/verifyPhotoId').patch(userController.verifyOrRejectPhotoId);

module.exports = router;
