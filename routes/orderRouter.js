const express = require('express');

const authController = require('../controllers/authController');
const orderController = require('../controllers/orderController');

const router = express.Router();

// Protect all routes after this middleware
router.use(authController.protect);

// Admin dashboard metrics
router.route('/admin/metrics').get(authController.restrictTo('user'), orderController.getAdminDashboardMetrics);

// Static routes first (these don't expect a dynamic parameter)
router.route('/additionalCharges').get(orderController.getAdditionalCharges);
router.route('/additionalChargesAndDiscounts')
  .post(orderController.calculateChargesAndDiscountAPI);
router.route('/orderDates').get(orderController.getOrderDates);

// Dynamic routes (these expect a parameter)
router
  .route('/')
  .post(orderController.createOrder)
  .get(orderController.getOrders);

router.route('/myOrders').get(orderController.getOrdersOnDate);
router.route('/:orderId/reorder').post(orderController.reorder);

router.route('/:orderId').delete(orderController.cancelOrder);

// Route for getting and updating the order status
router
  .route('/:id')
  .get(orderController.getOrder)
  .patch(orderController.updateOrderStatus);

// Initiate payment
router.route('/:orderId/initiate-payment')
  .post(
    authController.protect,
    orderController.initiatePayment
  );

// Add this new route
router.post(
  '/cancel-payment/:paymentIntentId',
  authController.protect,
  orderController.cancelOrderByPaymentIntent
);

module.exports = router;
