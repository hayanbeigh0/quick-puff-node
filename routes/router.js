const express = require('express');

const userRouter = require('./userRouter');
const authRouter = require('./authRouter');
const productRouter = require('./productRouter');
const serviceableLocationRouter = require('./serviceableLocationRouter');
const productCategoryRouter = require('./productCategoryRouter');

const router = express.Router();

router.use('/users', userRouter);
router.use('/auth', authRouter);
router.use('/product', productRouter);
router.use('/serviceableLocation', serviceableLocationRouter);
router.use('/productCategory', productCategoryRouter);

module.exports = router;
