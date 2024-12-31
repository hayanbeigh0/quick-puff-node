const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

// This route needs raw body for Stripe signature verification
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  webhookController.webhookHandler
);

module.exports = router; 