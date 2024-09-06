const mongoose = require('mongoose');

const recentSearchSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    searchQuery: {
      type: String,
      required: true,
      trim: true,
    },
    searchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

recentSearchSchema.index({ user: 1, searchQuery: 1 }, { unique: true }); // Index to ensure unique searches per user

const RecentSearch = mongoose.model('RecentSearch', recentSearchSchema);

module.exports = RecentSearch;
