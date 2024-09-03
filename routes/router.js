const express = require('express');

const userRouter = require('./userRouter');
const authRouter = require('./authRouter');
const productRouter = require('./productRouter');
const serviceableLocationRouter = require('./serviceableLocationRouter');
const productCategoryRouter = require('./productCategoryRouter');
const brandCategoryRouter = require('./brandCategoryRouter');

const router = express.Router();

router.use('/users', userRouter);
router.use('/auth', authRouter);
router.use('/product', productRouter);
router.use('/serviceableLocation', serviceableLocationRouter);
router.use('/productCategory', productCategoryRouter);
router.use('/brandCategory', brandCategoryRouter);

module.exports = router;
