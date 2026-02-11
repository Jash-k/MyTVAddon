const config = require('./config');
const { log, debug, formatBytes } = require('./utils');

class LRUCache {
  constructor(options = {}) {
    this.max = options.max || 100;
    this.ttl = options.ttl || 5 * 60 * 1000;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }

  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - item.time > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    
    this.stats.hits++;
    return item.value;
  }

  set(key, value) {
    // Delete if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Remove oldest if at capacity
    while (this.cache.size >= this.max) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      time: Date.now()
    });

    this.stats.sets++;
  }

  has(key) {
    const item = this.cache.get(key);
    if (!item) return false;
    if (Date.now() - item.time > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }

  size() {
    return this.cache.size;
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2)
      : 0;

    return {
      size: this.cache.size,
      max: this.max,
      ttl: this.ttl,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      hitRate: `${hitRate}%`
    };
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now - item.time > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      debug(`[CACHE] Cleaned ${cleaned} expired entries`);
    }

    return cleaned;
  }
}

// Create cache instances
const channelCache = new LRUCache({
  max: 1,
  ttl: config.CHANNEL_CACHE_TTL
});

const streamCache = new LRUCache({
  max: config.MAX_CACHE_ENTRIES,
  ttl: config.STREAM_CACHE_TTL
});

const metaCache = new LRUCache({
  max: config.MAX_CACHE_ENTRIES,
  ttl: config.CHANNEL_CACHE_TTL
});

// Periodic cleanup (every 10 minutes)
setInterval(() => {
  channelCache.cleanup();
  streamCache.cleanup();
  metaCache.cleanup();
}, 10 * 60 * 1000);

module.exports = {
  LRUCache,
  channelCache,
  streamCache,
  metaCache
};