const NodeCache = require('node-cache');

// Create cache instances
const productCategoryCache = new NodeCache({ stdTTL: 3600 }); // 1 hour
const productCache = new NodeCache({ stdTTL: 3600 });
const brandCache = new NodeCache({ stdTTL: 3600 });
const homeCache = new NodeCache({ stdTTL: 3600 });
// Add other caches as needed...

// Cache keys
const CACHE_KEYS = {
  PRODUCT_CATEGORIES: 'allProductCategories',
  TOTAL_PRODUCT_CATEGORIES: 'totalProductCategories',
  // Add other cache keys as needed...
};

// Individual clear functions
const clearProductCategoriesCache = () => {
  productCategoryCache.del(CACHE_KEYS.PRODUCT_CATEGORIES);
  productCategoryCache.del(CACHE_KEYS.TOTAL_PRODUCT_CATEGORIES);
};

const clearProductCache = () => {
  productCache.flushAll();
};

const clearBrandCache = () => {
  brandCache.flushAll();
};

const clearHomeCache = () => {
  homeCache.flushAll();
};

// Clear all caches
const clearAllCache = () => {
  productCategoryCache.flushAll();
  productCache.flushAll();
  brandCache.flushAll();
  homeCache.flushAll();
  // Add other cache clearing as needed...
  console.log('All caches cleared');
};

// Export cache instances
const cacheInstances = {
  productCategoryCache,
  productCache,
  brandCache,
  homeCache
};

module.exports = {
  cacheInstances,
  CACHE_KEYS,
  clearProductCategoriesCache,
  clearProductCache,
  clearBrandCache,
  clearHomeCache,
  clearAllCache
}; 