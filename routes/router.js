const express = require('express');

const userRouter = require('./userRouter');
const authRouter = require('./authRouter');
const productRouter = require('./productRouter');
const serviceableLocationRouter = require('./serviceableLocationRouter');
const productCategoryRouter = require('./productCategoryRouter');
const brandRouter = require('./brandRouter');
const homeRouter = require('./homeRouter');
const categoryRouter = require('./categoryRouter');
const flavorRouter = require('./flavorRouter');
const recentSearchRouter = require('./recentSearchRouter');
const cartRouter = require('./cartRouter');
const orderRouter = require('./orderRouter');
const adminRouter = require('./adminRouter');
const advertisementRouter = require('./advertisementRouter');
const fulfillmentCenterRouter = require('./fulfillmentCenterRouter');
const feedbackRouter = require('./feedbackRouter');
const webhookRouter = require('./webhookRouter');
const promoCodeRouter = require('./promoCodeRouter');

const router = express.Router();

router.use('/users', userRouter);
router.use('/auth', authRouter);
router.use('/product', productRouter);
router.use('/serviceableLocation', serviceableLocationRouter);
router.use('/productCategory', productCategoryRouter);
router.use('/brand', brandRouter);
router.use('/home', homeRouter);
router.use('/category', categoryRouter);
router.use('/flavor', flavorRouter);
router.use('/recentSearch', recentSearchRouter);
router.use('/cart', cartRouter);
router.use('/order', orderRouter);
router.use('/admin', adminRouter);
router.use('/advertisement', advertisementRouter);
router.use('/fulfillmentCenter', fulfillmentCenterRouter);
router.use('/feedback', feedbackRouter);
router.use('/promoCode', promoCodeRouter);

module.exports = router;
