import { describe, expect, it } from 'vitest';
import { LeagueApi } from './api.js';
import { dispatchMcp } from './mcp.js';

const TOOLS = [
  'list_formats',
  'list_regions',
  'list_seasons',
  'get_season',
  'list_divisions',
  'get_standings',
  'get_placements',
  'list_teams',
  'get_team',
  'list_matches',
  'get_match',
  'get_player',
];

type Recorded = { url: string; init: RequestInit };

function apiRecording(respond: (url: string) => Response) {
  const seen: Recorded[] = [];
  const api = new LeagueApi({
    baseUrl: 'https://mge.tf',
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return respond(url);
    },
  });
  return { api, seen };
}

function jsonBody(result: Awaited<ReturnType<typeof dispatchMcp>>) {
  expect(result.kind).toBe('json');
  if (result.kind !== 'json') throw new Error('expected a JSON-RPC body');
  return result.body as {
    result?: {
      tools?: { name: string; description?: string }[];
      serverInfo?: { name: string };
      protocolVersion?: string;
      instructions?: string;
      content?: { type: string; text: string }[];
      isError?: boolean;
    };
  };
}

describe('dispatchMcp', () => {
  it('lists the twelve public reads', async () => {
    const { api } = apiRecording(() => Response.json({ data: [] }));
    const body = jsonBody(await dispatchMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, api));
    expect(body.result?.tools?.map((tool) => tool.name).sort()).toEqual([...TOOLS].sort());
    expect(body.result?.tools?.find((tool) => tool.name === 'list_matches')?.description).toContain(
      'unplayed',
    );
  });

  it('handles initialize', async () => {
    const { api } = apiRecording(() => Response.json({ data: [] }));
    const body = jsonBody(
      await dispatchMcp(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test' } },
        },
        api,
      ),
    );
    expect(body.result?.serverInfo?.name).toBe('mge-league');
    expect(body.result?.instructions).toContain('Do not query the production database');
    expect(body.result?.protocolVersion).toBe('2025-03-26');
  });

  it('echoes protocol 2025-11-25', async () => {
    const { api } = apiRecording(() => Response.json({ data: [] }));
    const body = jsonBody(
      await dispatchMcp(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-11-25' },
        },
        api,
      ),
    );
    expect(body.result?.protocolVersion).toBe('2025-11-25');
  });

  it('acks notifications without a JSON-RPC body', async () => {
    const { api } = apiRecording(() => Response.json({ data: [] }));
    const result = await dispatchMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, api);
    expect(result).toEqual({ kind: 'empty' });
  });

  it('calls the season list and returns the JSON page', async () => {
    const { api, seen } = apiRecording(() =>
      Response.json({
        data: [{ id: 4, number: 12 }],
        page: { page: 1, perPage: 50, total: 1, totalPages: 1 },
      }),
    );
    const body = jsonBody(
      await dispatchMcp(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'list_seasons',
            arguments: { current: true, format: '1v1', regionId: 2 },
          },
        },
        api,
      ),
    );
    expect(body.result?.isError).toBe(false);
    expect(seen[0]?.url).toBe('https://mge.tf/api/v1/seasons?regionId=2&format=1v1&current=true');
    expect(new Headers(seen[0]?.init.headers).get('authorization')).toBeNull();
    expect(JSON.parse(body.result?.content?.[0]?.text ?? '')).toMatchObject({
      data: [{ id: 4, number: 12 }],
    });
  });

  it('returns the API error as a tool error', async () => {
    const { api } = apiRecording(() =>
      Response.json({ error: 'Season not found' }, { status: 404 }),
    );
    const body = jsonBody(
      await dispatchMcp(
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'get_season', arguments: { seasonId: 99 } },
        },
        api,
      ),
    );
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toBe('HTTP 404: Season not found');
  });

  it('explains a staging block', async () => {
    const { api } = apiRecording(() => Response.json({ error: 'Forbidden' }, { status: 403 }));
    const body = jsonBody(
      await dispatchMcp(
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'list_formats', arguments: {} },
        },
        api,
      ),
    );
    expect(body.result?.content?.[0]?.text).toContain('dev.mge.tf');
  });

  it('rejects a legacy steam id before the request', async () => {
    const { api, seen } = apiRecording(() => Response.json({}));
    const body = jsonBody(
      await dispatchMcp(
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: { name: 'get_player', arguments: { steamId: 'STEAM_0:1:1' } },
        },
        api,
      ),
    );
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toContain('steamId');
    expect(seen).toHaveLength(0);
  });
});
