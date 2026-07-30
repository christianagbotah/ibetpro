// ============================================================================
// iBetPro Rate Limiter
// In-memory sliding window rate limiter for API routes
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const limits = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of limits.entries()) {
    if (now > entry.resetTime) {
      limits.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /** Maximum number of requests in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

// Preset rate limit configurations
export const RATE_LIMITS = {
  /** General API: 60 requests per minute */
  standard: { maxRequests: 60, windowSeconds: 60 },
  /** Authentication: 5 attempts per minute */
  auth: { maxRequests: 5, windowSeconds: 60 },
  /** AI analysis: 10 requests per minute (expensive) */
  ai: { maxRequests: 10, windowSeconds: 60 },
  /** Betting: 20 requests per minute */
  betting: { maxRequests: 20, windowSeconds: 60 },
  /** Sync: 3 requests per minute */
  sync: { maxRequests: 3, windowSeconds: 60 },
  /** Admin: 30 requests per minute */
  admin: { maxRequests: 30, windowSeconds: 60 },
} as const;

export type RateLimitPreset = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Check if a request is within rate limits
 * @param identifier - Usually user ID or IP address
 * @param config - Rate limit configuration or preset name
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig | RateLimitPreset
): RateLimitResult {
  const limitConfig = typeof config === "string" ? RATE_LIMITS[config] : config;
  const key = `${identifier}:${limitConfig.maxRequests}:${limitConfig.windowSeconds}`;
  const now = Date.now();
  const windowMs = limitConfig.windowSeconds * 1000;

  const entry = limits.get(key);

  if (!entry || now > entry.resetTime) {
    // New window
    limits.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      allowed: true,
      remaining: limitConfig.maxRequests - 1,
      resetAt: now + windowMs,
    };
  }

  if (entry.count >= limitConfig.maxRequests) {
    // Rate limited
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetTime,
      retryAfter: Math.ceil((entry.resetTime - now) / 1000),
    };
  }

  // Increment count
  entry.count++;
  return {
    allowed: true,
    remaining: limitConfig.maxRequests - entry.count,
    resetAt: entry.resetTime,
  };
}

/**
 * Create rate limit headers for the response
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
  if (result.retryAfter) {
    headers["Retry-After"] = String(result.retryAfter);
  }
  return headers;
}
