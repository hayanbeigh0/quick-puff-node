const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

router.post(
  '/stripe',
  webhookController.stripeWebhookHandler
);

module.exports = router; 