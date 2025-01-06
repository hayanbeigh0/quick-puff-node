const express = require('express');
const { clearAllCache } = require('../utils/cacheManager');
const authController = require('../controllers/authController');

const router = express.Router();

// Protect this route with admin authentication
router.post('/clear-cache', 
  authController.protect, 
  authController.restrictTo('admin'), 
  (req, res) => {
    clearAllCache();
    res.status(200).json({
      status: 'success',
      message: 'All caches cleared successfully'
    });
  }
);

module.exports = router;
