const express = require('express');

const userRouter = require('./userRouter');
const authRouter = require('./authRouter');
const productRouter = require('./productRouter');
const serviceableLocationRouter = require('./serviceableLocationRouter');
const productCategoryRouter = require('./productCategoryRouter');
const brandCategoryRouter = require('./brandCategoryRouter');
const brandRouter = require('./brandRouter');
const homeRouter = require('./homeRouter');
const categoryRouter = require('./categoryRouter');
const flavorRouter = require('./flavorRouter');
const recentSearchRouter = require('./recentSearchRouter');

const router = express.Router();

router.use('/users', userRouter);
router.use('/auth', authRouter);
router.use('/product', productRouter);
router.use('/serviceableLocation', serviceableLocationRouter);
router.use('/productCategory', productCategoryRouter);
router.use('/brandCategory', brandCategoryRouter);
router.use('/brand', brandRouter);
router.use('/home', homeRouter);
router.use('/category', categoryRouter);
router.use('/flavor', flavorRouter);
router.use('/recentSearch', recentSearchRouter);

module.exports = router;
