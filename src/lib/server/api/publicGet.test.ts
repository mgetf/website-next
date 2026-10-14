import { describe, expect, it } from 'vitest';
import { publicGet } from './publicGet.js';
import { PublicNotFoundError, PublicQueryError } from './publicLeagueQuery.js';

describe('publicGet', () => {
  it('serves the payload without an API key and stamps the quota', async () => {
    const response = await publicGet(
      () => '203.0.113.20',
      async () => ({ data: [] }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('RateLimit-Policy')).toBe('"public-read";q=100;w=60');
    expect(response.headers.get('RateLimit')).toMatch(/^"public-read";r=\d+;t=\d+$/);
    expect(response.headers.get('Retry-After')).toBeNull();
    await expect(response.json()).resolves.toEqual({ data: [] });
  });

  it('keeps the error envelope for a missing resource', async () => {
    const response = await publicGet(
      () => '203.0.113.21',
      async () => {
        throw new PublicNotFoundError('Season not found');
      },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('RateLimit-Policy')).toContain('public-read');
    await expect(response.json()).resolves.toEqual({ error: 'Season not found' });
  });

  it('keeps the error envelope for a bad query', async () => {
    const response = await publicGet(
      () => '203.0.113.22',
      async () => {
        throw new PublicQueryError('Invalid page');
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid page' });
  });

  it('counts a missing address against one shared bucket', async () => {
    const first = await publicGet(
      () => {
        throw new Error('no address');
      },
      async () => ({ ok: true }),
    );
    const second = await publicGet(
      () => '',
      async () => ({ ok: true }),
    );

    const remaining = (header: string | null) => Number(header?.match(/r=(\d+)/)?.[1]);
    expect(remaining(second.headers.get('RateLimit'))).toBe(
      remaining(first.headers.get('RateLimit')) - 1,
    );
  });
});
