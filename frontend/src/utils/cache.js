/**
 * Cache utility for localStorage management
 * Provides time-based caching with automatic invalidation
 */

const CACHE_PREFIX = 'chick_cache_';
const DEFAULT_TTL = 1 * 60 * 1000; // 1 minute in milliseconds

/**
 * Get cached data from localStorage
 * @param {string} key - Cache key
 * @returns {any|null} Cached data or null if expired/not found
 */
export const getCache = (key) => {
  try {
    const fullKey = `${CACHE_PREFIX}${key}`;
    const cached = localStorage.getItem(fullKey);
    
    if (!cached) {
      return null;
    }

    const { data, timestamp, ttl } = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is expired
    if (now - timestamp > ttl) {
      localStorage.removeItem(fullKey);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error reading from cache:', error);
    return null;
  }
};

/**
 * Set data in cache with TTL
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttl - Time to live in milliseconds (default: 5 minutes)
 */
export const setCache = (key, data, ttl = DEFAULT_TTL) => {
  try {
    const fullKey = `${CACHE_PREFIX}${key}`;
    const cacheData = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    localStorage.setItem(fullKey, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Error writing to cache:', error);
  }
};

/**
 * Remove specific cache entry
 * @param {string} key - Cache key to remove
 */
export const removeCache = (key) => {
  try {
    const fullKey = `${CACHE_PREFIX}${key}`;
    localStorage.removeItem(fullKey);
  } catch (error) {
    console.error('Error removing from cache:', error);
  }
};

/**
 * Clear all cached data for the application
 */
export const clearAllCache = () => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
};

/**
 * Check if cache exists and is valid
 * @param {string} key - Cache key
 * @returns {boolean} True if cache exists and is valid
 */
export const hasValidCache = (key) => {
  return getCache(key) !== null;
};

/**
 * Invalidate cache for specific resource types
 * @param {string} resourceType - Resource type (e.g., 'branches', 'products')
 */
export const invalidateCache = (resourceType) => {
  removeCache(resourceType);
};
