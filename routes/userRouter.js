const express = require('express');

const authController = require('../controllers/authController');
const userController = require('../controllers/userController')

const router = express.Router();

router.route('/').patch(authController.protect, userController.updateProfile)

module.exports = router;
