const express = require('express');

const authController = require('../controllers/authController');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.use(authController.protect);

router
  .route('/')
  .post(orderController.createOrder)
  .get(orderController.getOrders);

router.route('/myOrders').get(orderController.getOrdersOnDate);
router.route('/:orderId/reorder').post(orderController.reorder);
router.route('/orderDates').get(orderController.getOrderDates);

router.route('/:orderId').delete(orderController.cancelOrder);

router
  .route('/:id')
  .get(orderController.getOrder)
  .patch(orderController.updateOrderStatus);
router
  .route('/additionalCharges')
  .get(orderController.getOrder)

module.exports = router;
