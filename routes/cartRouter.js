const express = require('express');

const authController = require('../controllers/authController');
const cartController = require('../controllers/cartController');
const promoCodeController = require('../controllers/promoCodeController');

const router = express.Router();

router.use(authController.protect);

router
  .route('/')
  .post(cartController.addItemToCart)
  .get(cartController.getCart);

router
  .route('/:productId')
  .patch(cartController.updateCartItemQuantity)
  .delete(cartController.removeItemFromCart);

router.post('/apply-promo', promoCodeController.applyPromoCode);

module.exports = router;
