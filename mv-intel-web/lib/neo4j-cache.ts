/**
 * Neo4j Query Cache
 * Implements intelligent caching for Neo4j queries to improve performance
 */

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class Neo4jCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 1000; // Maximum number of cached entries
  private defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL

  /**
   * Generate cache key from query parameters
   */
  private generateKey(query: string, params: any = {}): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${JSON.stringify(params[key])}`)
      .join('|');
    return `${query}|${sortedParams}`;
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  /**
   * Get cached data
   */
  get(query: string, params: any = {}): any | null {
    const key = this.generateKey(query, params);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (!this.isValid(entry)) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cached data
   */
  set(query: string, params: any = {}, data: any, ttl: number = this.defaultTTL): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const key = this.generateKey(query, params);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.calculateHitRate()
    };
  }

  private hits = 0;
  private misses = 0;

  private calculateHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  /**
   * Record cache hit
   */
  recordHit(): void {
    this.hits++;
  }

  /**
   * Record cache miss
   */
  recordMiss(): void {
    this.misses++;
  }
}

// Singleton instance
export const neo4jCache = new Neo4jCache();

// Cache TTL configurations for different query types
export const CACHE_TTL = {
  GRAPH_DATA: 2 * 60 * 1000, // 2 minutes for graph data
  SEMANTIC_SEARCH: 1 * 60 * 1000, // 1 minute for search results
  NODE_DETAILS: 5 * 60 * 1000, // 5 minutes for node details
  GRAPH_METRICS: 10 * 60 * 1000, // 10 minutes for graph metrics
  STATIC_DATA: 30 * 60 * 1000, // 30 minutes for static data
} as const;

// Cleanup expired entries every 5 minutes
setInterval(() => {
  neo4jCache.cleanup();
}, 5 * 60 * 1000);
