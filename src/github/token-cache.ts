/**
 * Installation Token Cache
 * Handles token caching with automatic refresh before expiry
 */

interface CachedToken {
  token: string;
  expiresAt: Date;
}

export class TokenCache {
  private cache: Map<number, CachedToken> = new Map();
  private refreshMarginMs: number;

  /**
   * @param refreshMarginMs - Refresh tokens this many ms before expiry (default: 5 minutes)
   */
  constructor(refreshMarginMs = 5 * 60 * 1000) {
    this.refreshMarginMs = refreshMarginMs;
  }

  /**
   * Get a cached token if valid
   */
  get(installationId: number): string | null {
    const cached = this.cache.get(installationId);
    if (!cached) return null;

    const refreshThreshold = new Date(Date.now() + this.refreshMarginMs);
    if (cached.expiresAt <= refreshThreshold) {
      // Token expired or expiring soon
      this.cache.delete(installationId);
      return null;
    }

    return cached.token;
  }

  /**
   * Store a token in the cache
   */
  set(installationId: number, token: string, expiresAt: Date | string): void {
    const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    this.cache.set(installationId, {
      token,
      expiresAt: expiry,
    });
  }

  /**
   * Check if a valid token exists
   */
  has(installationId: number): boolean {
    return this.get(installationId) !== null;
  }

  /**
   * Clear a specific installation's token
   */
  clear(installationId: number): void {
    this.cache.delete(installationId);
  }

  /**
   * Clear all cached tokens
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { count: number; installations: number[] } {
    return {
      count: this.cache.size,
      installations: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance for the application
export const tokenCache = new TokenCache();
