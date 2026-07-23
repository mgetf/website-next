/**
 * Rate Limiting Utility
 * In-memory rate limiting for sensitive endpoints, using a sliding window
 * approach. Limits are tracked per Node process — this reduces abuse but is
 * not a global quota across multiple replicas/instances.
 */

import { formError } from './forms';
import type { FormActionError } from './forms';
import type { ActionFailure } from '@sveltejs/kit';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Optional: Clean up old entries interval (default: 60 seconds) */
  cleanupIntervalMs?: number;
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private config: RateLimiterConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig) {
    this.config = {
      ...config,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60000,
    };

    // Set up periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    // Don't prevent process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check if a request should be allowed
   * Returns true if allowed, false if rate limited
   */
  check(key: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      // No entry or expired - create new one
      this.store.set(key, {
        count: 1,
        resetAt: now + this.config.windowMs,
      });
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetIn: this.config.windowMs,
      };
    }

    // Entry exists and not expired
    if (entry.count >= this.config.maxRequests) {
      // Rate limited
      return {
        allowed: false,
        remaining: 0,
        resetIn: entry.resetAt - now,
      };
    }

    // Increment and allow
    entry.count++;
    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      resetIn: entry.resetAt - now,
    };
  }

  /**
   * Reset rate limit for a key (e.g., after successful login)
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Stop the cleanup interval (for testing/cleanup)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Pre-configured rate limiters for common use cases

/**
 * Rate limiter for authentication endpoints
 * 5 attempts per minute per IP
 */
export const authRateLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Rate limiter for payment endpoints
 * 10 requests per minute per user
 */
export const paymentRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Rate limiter for password attempts
 * 5 attempts per 5 minutes per IP + team combination
 */
export const passwordRateLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 5 * 60 * 1000, // 5 minutes
});

/**
 * Rate limiter for general API requests
 * 100 requests per minute per API key (or IP for non-key callers)
 */
export const apiRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Rate limiter for admin actions
 * 30 actions per minute per user
 */
export const adminRateLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Rate limiter for public map zip downloads
 * 10 downloads per minute per IP (endpoint is expensive)
 */
export const mapDownloadRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Fallback helper to get a client IP directly from a Request, for call
 * sites that don't have access to SvelteKit's getClientAddress().
 * @lintignore kept as a fallback for non-SvelteKit-handler call sites
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

/**
 * Check a rate limit for API routes and return a 429 Response if exceeded.
 */
export function checkRateLimit(
  limiter: RateLimiter,
  key: string,
): { allowed: boolean; response?: Response } {
  const result = limiter.check(key);

  if (!result.allowed) {
    return {
      allowed: false,
      response: new Response(
        JSON.stringify({
          error: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil(result.resetIn / 1000),
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(result.resetIn / 1000)),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(result.resetIn / 1000)),
          },
        },
      ),
    };
  }

  return { allowed: true };
}

/**
 * Check a rate limit for form actions. Returns a formError() ActionFailure
 * (status 429) if the limit was exceeded, or null when the request is allowed.
 */
export function checkFormActionRateLimit(
  limiter: RateLimiter,
  key: string,
): ActionFailure<FormActionError> | null {
  const result = limiter.check(key);

  if (!result.allowed) {
    return formError('Too many attempts. Please try again later.', 429);
  }

  return null;
}

// Export the RateLimiter class for custom configurations
export { RateLimiter };
