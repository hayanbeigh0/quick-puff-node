const express = require('express');
const promoCodeController = require('../controllers/promoCodeController');
const authController = require('../controllers/authController');

const router = express.Router();

// Protect the routes
router.use(authController.protect);

// CRUD operations
router
    .route('/')
    .post(promoCodeController.createPromoCode)
    .get(promoCodeController.getAllPromoCodes);

router
    .route('/:id')
    .get(promoCodeController.getPromoCode)
    .patch(promoCodeController.updatePromoCode)
    .delete(promoCodeController.deletePromoCode);

// Apply promo code
router.post('/apply', promoCodeController.applyPromoCode);

module.exports = router;  