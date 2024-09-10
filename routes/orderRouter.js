const express = require('express');

const authController = require('../controllers/authController');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.use(authController.protect);

router
  .route('/')
  .post(orderController.createOrder)
  .get(orderController.getOrders);

router
  .route('/:orderId')
  .delete(orderController.cancelOrder);

  router
  .route('/:id')
  .get(orderController.getOrder)

module.exports = router;
