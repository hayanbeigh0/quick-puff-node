const express = require('express');

const authController = require('../controllers/authController');

const router = express.Router();

router.post('/google-sign-in', authController.googleSignIn);
router.post('/apple-sign-in', authController.appleSignIn);
router.post('/email-sign-in', authController.signupOrSigninWithEmail);
router.post('/email-sign-in/verify', authController.verifyAuthCode);

module.exports = router;
