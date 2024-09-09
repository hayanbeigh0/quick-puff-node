const express = require('express');

const authController = require('../controllers/authController');
const cartController = require('../controllers/cartController');

const router = express.Router();

router.use(authController.protect);

console.log('in the router...');

router
  .route('/')
  .post(cartController.addItemToCart)
  .get(cartController.getCart);

router
  .route('/:productId')
  .patch(cartController.updateCartItemQuantity)
  .delete(cartController.removeItemFromCart);

module.exports = router;
