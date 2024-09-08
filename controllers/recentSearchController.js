const RecentSearch = require('../models/recentSearchModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

const addRecentSearch = catchAsync(async (req, res, next) => {
  const { searchQuery } = req.body;
  const userId = req.user.id;

  await RecentSearch.findOneAndUpdate(
    { user: userId, searchQuery },
    { $set: { searchedAt: Date.now() } },
    { upsert: true, new: true },
  );

  res.status(200).json({
    status: 'success',
    message: 'Search added to recent searches',
  });
});

const getRecentSearches = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const recentSearches = await RecentSearch.find({ user: userId })
    .sort({ searchedAt: -1 })
    .limit(10); // Fetch up to 10 recent searches

  res.status(200).json({
    status: 'success',
    recentSearches,
  });
});

const deleteRecentSearch = catchAsync(async (req, res, next) => {
  const searchId = req.params.searchId; // Access the ID from params
  const userId = req.user.id;

  const result = await RecentSearch.findOneAndDelete({
    user: userId,
    _id: searchId,
  });

  if (!result) {
    return next(new AppError('No recent search found with that ID', 404));
  }

  const recentSearches = await RecentSearch.find({ user: userId })
    .sort({ searchedAt: -1 })
    .limit(10);

  res.status(204).json({
    status: 'success',
    recentSearches,
  });
});

const deleteAllRecentSearches = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  await RecentSearch.deleteMany({ user: userId });

  res.status(204).json({
    status: 'success',
    message: 'All recent searches deleted',
  });
});

module.exports = {
  addRecentSearch,
  getRecentSearches,
  deleteRecentSearch,
  deleteAllRecentSearches,
};
