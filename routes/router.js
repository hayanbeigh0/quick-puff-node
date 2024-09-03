const express = require('express');

const userRouter = require('./userRouter');
const authRouter = require('./authRouter');
const productRouter = require('./productRouter');
const serviceableLocationRouter = require('./serviceableLocationRouter');

const router = express.Router();

router.use('/users', userRouter);
router.use('/auth', authRouter);
router.use('/product', productRouter);
router.use('/serviceableLocation', serviceableLocationRouter);

module.exports = router;
