// cacheProvider.js

const NodeCache = require('node-cache');

// Create an instance of NodeCache
const cache = new NodeCache({ stdTTL: 0 }); // `stdTTL` is set to 0 so TTL must be set per item

const nodeCacheProvider = {
  set: (key, value, ttl) => {
    return new Promise((resolve, reject) => {
      try {
        cache.set(key, value, ttl);
        resolve(true); // `true` if setting the cache succeeds
      } catch (err) {
        reject(err); // Propagate the error
      }
    });
  },
  get: (key) => {
    return new Promise((resolve) => {
      const value = cache.get(key);
      resolve(value);
    });
  },
};

module.exports = { nodeCacheProvider };
