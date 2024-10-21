const express = require('express');

const authController = require('../controllers/authController');
const homeController = require('../controllers/homeController');
const fileUploadController = require('../controllers/fileUploadController');

const router = express.Router();

router.route('/').get(homeController.homePageData);

module.exports = router;
