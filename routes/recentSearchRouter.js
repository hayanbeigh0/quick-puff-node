const express = require('express');

const authController = require('../controllers/authController');
const recentSearchController = require('../controllers/recentSearchController');

const router = express.Router();

router
  .route('/')
  .post(
    authController.protect, // Ensure the user is authenticated
    recentSearchController.addRecentSearch, // Create the product
  )
  .get(authController.protect, recentSearchController.getRecentSearches);
router
  .route('/:searchId')
  .delete(authController.protect, recentSearchController.deleteRecentSearch);
router
  .route('/')
  .delete(
    authController.protect,
    recentSearchController.deleteAllRecentSearches,
  );

module.exports = router;
