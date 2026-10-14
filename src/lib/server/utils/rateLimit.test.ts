import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceRateLimit, RateLimiter, checkRateLimit, getClientIp } from './rateLimit';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests until the window is exhausted', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000, cleanupIntervalMs: 60_000 });

    expect(limiter.check('ip').allowed).toBe(true);
    expect(limiter.check('ip')).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check('ip').allowed).toBe(false);

    limiter.destroy();
  });

  it('resets quota after the window expires', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000, cleanupIntervalMs: 60_000 });

    expect(limiter.check('ip').allowed).toBe(true);
    expect(limiter.check('ip').allowed).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(limiter.check('ip').allowed).toBe(true);

    limiter.destroy();
  });

  it('reset clears a key immediately', () => {
    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 10_000,
      cleanupIntervalMs: 60_000,
    });

    expect(limiter.check('ip').allowed).toBe(true);
    expect(limiter.check('ip').allowed).toBe(false);
    limiter.reset('ip');
    expect(limiter.check('ip').allowed).toBe(true);

    limiter.destroy();
  });
});

describe('getClientIp', () => {
  it('prefers the first x-forwarded-for hop', () => {
    const request = new Request('https://mge.tf', {
      headers: {
        'x-forwarded-for': '1.1.1.1, 2.2.2.2',
        'x-real-ip': '3.3.3.3',
      },
    });
    expect(getClientIp(request)).toBe('1.1.1.1');
  });

  it('falls back to x-real-ip and unknown', () => {
    expect(
      getClientIp(new Request('https://mge.tf', { headers: { 'x-real-ip': '9.9.9.9' } })),
    ).toBe('9.9.9.9');
    expect(getClientIp(new Request('https://mge.tf'))).toBe('unknown');
  });
});

describe('enforceRateLimit', () => {
  const policy = { name: 'public-read', quota: 2, windowSeconds: 60 };

  it('stamps the IETF quota headers and counts the request', () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 60_000,
      cleanupIntervalMs: 60_000,
    });
    const first = enforceRateLimit(limiter, '203.0.113.5', policy);

    expect(first.response).toBeNull();
    expect(first.headers.get('RateLimit-Policy')).toBe('"public-read";q=2;w=60');
    expect(first.headers.get('RateLimit')).toBe('"public-read";r=1;t=60');
    expect(first.headers.get('Retry-After')).toBeNull();

    limiter.destroy();
  });

  it('returns 429 with Retry-After once the window is spent', async () => {
    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 60_000,
      cleanupIntervalMs: 60_000,
    });
    enforceRateLimit(limiter, '203.0.113.6', policy);

    const blocked = enforceRateLimit(limiter, '203.0.113.6', policy);
    expect(blocked.response?.status).toBe(429);
    expect(blocked.response?.headers.get('Retry-After')).toBe('60');
    expect(blocked.headers.get('RateLimit')).toBe('"public-read";r=0;t=60');
    await expect(blocked.response?.json()).resolves.toEqual({
      error: 'Too many requests. Please try again later.',
    });

    const other = enforceRateLimit(limiter, '203.0.113.7', policy);
    expect(other.response).toBeNull();

    limiter.destroy();
  });
});

describe('checkRateLimit', () => {
  it('returns a 429 response when blocked', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000, cleanupIntervalMs: 60_000 });
    expect(checkRateLimit(limiter, 'k').allowed).toBe(true);

    const blocked = checkRateLimit(limiter, 'k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.response?.status).toBe(429);

    limiter.destroy();
  });
});
