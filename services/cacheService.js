// cacheService.js

module.exports = (provider) => {
  const save = (key, item, ttl) => {
    return provider.set(key, item, ttl);
  };

  const getItem = (key) => {
    return provider.get(key);
  };

  return {
    save,
    getItem,
  };
};
