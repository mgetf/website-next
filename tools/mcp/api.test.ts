import { afterEach, describe, expect, it } from 'vitest';
import {
  MCP_VERSION,
  LeagueApi,
  LeagueApiError,
  leagueResourcePath,
  resolveApiBase,
  toQuery,
} from './api.js';

const ORIGINAL_BASE = process.env.MGE_API_BASE;
const ORIGINAL_KEY = process.env.MGE_API_KEY;

afterEach(() => {
  restore('MGE_API_BASE', ORIGINAL_BASE);
  restore('MGE_API_KEY', ORIGINAL_KEY);
});

describe('resolveApiBase', () => {
  it('defaults to the public site', () => {
    delete process.env.MGE_API_BASE;
    expect(resolveApiBase()).toBe('https://mge.tf');
    expect(resolveApiBase('https://mge.tf/')).toBe('https://mge.tf');
  });

  it('reads MGE_API_BASE and lets an explicit origin win', () => {
    process.env.MGE_API_BASE = 'http://127.0.0.1:5173';
    expect(resolveApiBase()).toBe('http://127.0.0.1:5173');
    expect(resolveApiBase('https://mge.tf')).toBe('https://mge.tf');
  });

  it('accepts a local IPv6 origin', () => {
    expect(resolveApiBase('http://[::1]:5173')).toBe('http://[::1]:5173');
  });

  it('rejects credentials, paths, and non-http schemes', () => {
    expect(() => resolveApiBase('https://user:secret@mge.tf')).toThrow(/credentials/);
    expect(() => resolveApiBase('https://mge.tf/api/v1')).toThrow(/origin/);
    expect(() => resolveApiBase('https://mge.tf/?page=1')).toThrow(/origin/);
    expect(() => resolveApiBase('ftp://mge.tf')).toThrow(/http/);
    expect(() => resolveApiBase('not a url')).toThrow(/valid URL/);
  });
});

describe('league requests', () => {
  it('builds paged queries and drops filters that are absent or false', () => {
    expect(
      toQuery({
        regionId: 3,
        format: '1v1',
        current: true,
        page: 2,
        status: undefined,
      }),
    ).toBe('?regionId=3&format=1v1&current=true&page=2');
    expect(toQuery({ current: false, page: undefined })).toBe('');
  });

  it('refuses a path outside the public league API', () => {
    expect(leagueResourcePath('/api/v1/seasons/4')).toBe('/api/v1/seasons/4');
    expect(() => leagueResourcePath('/api/v1/../admin')).toThrow(/Refusing/);
    expect(() => leagueResourcePath('/api/admin/db-health')).toThrow(/Refusing/);
  });

  it('requests the season list with the documented query and no credentials', async () => {
    process.env.MGE_API_KEY = `mge_${'ab'.repeat(32)}`;
    const seen: { url: string; init: RequestInit }[] = [];
    const api = new LeagueApi({
      baseUrl: 'https://mge.tf',
      fetchImpl: async (url, init) => {
        seen.push({ url, init });
        return Response.json({
          data: [],
          page: { page: 2, perPage: 50, total: 0, totalPages: 0 },
        });
      },
    });

    await expect(
      api.listSeasons({ regionId: 3, format: '1v1', current: true, page: 2 }),
    ).resolves.toEqual({
      data: [],
      page: { page: 2, perPage: 50, total: 0, totalPages: 0 },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(
      'https://mge.tf/api/v1/seasons?regionId=3&format=1v1&current=true&page=2',
    );
    expect(new Headers(seen[0]?.init.headers).get('authorization')).toBeNull();
    expect(new Headers(seen[0]?.init.headers).get('user-agent')).toBe(`mge-mcp/${MCP_VERSION}`);
    expect(seen[0]?.init.redirect).toBe('manual');
  });

  it('keeps the API error, the status, and Retry-After', async () => {
    const api = new LeagueApi({
      baseUrl: 'https://mge.tf',
      fetchImpl: async (url) => {
        if (url.endsWith('/standings?divisionId=9')) {
          return Response.json({ error: 'Division not found' }, { status: 404 });
        }
        return Response.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429, headers: { 'retry-after': '30' } },
        );
      },
    });

    await expect(api.getStandings(4, { divisionId: 9 })).rejects.toMatchObject({
      name: 'LeagueApiError',
      message: 'Division not found',
      status: 404,
    });
    await expect(api.listFormats()).rejects.toMatchObject({
      status: 429,
      retryAfter: '30',
    });
  });

  it('does not follow a redirect or accept an HTML body', async () => {
    const redirected = new LeagueApi({
      baseUrl: 'http://127.0.0.1:5173',
      fetchImpl: async () =>
        new Response(null, { status: 302, headers: { location: 'https://evil' } }),
    });
    await expect(redirected.listRegions()).rejects.toBeInstanceOf(LeagueApiError);
    await expect(redirected.listRegions()).rejects.toMatchObject({ status: 302 });

    const html = new LeagueApi({
      baseUrl: 'https://mge.tf',
      fetchImpl: async () => new Response('<html></html>', { status: 200 }),
    });
    await expect(html.getPlayer('76561198000000000')).rejects.toMatchObject({
      message: 'League API returned a non-JSON body',
    });
  });

  it('rejects a steam id that is not 17 digits before calling the network', async () => {
    const api = new LeagueApi({
      baseUrl: 'https://mge.tf',
      fetchImpl: async () => {
        throw new Error('fetch should not run');
      },
    });
    expect(() => api.getPlayer('STEAM_0:1:1')).toThrow(/Invalid steamId/);
    expect(() => api.listMatches({ player: 'STEAM_0:1:1' })).toThrow(/Invalid steamId/);
  });
});

function restore(name: 'MGE_API_BASE' | 'MGE_API_KEY', value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
