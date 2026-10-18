/**
 * Hand-rolled JSON-RPC for the league MCP.
 * Tool list plus dispatch. No MCP SDK. The tools call the public HTTP API.
 */

import { LeagueApi, LeagueApiError, MCP_VERSION } from './api.js';

const PROTOCOL_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);
const DEFAULT_PROTOCOL = '2025-03-26';

const INSTRUCTIONS =
  'Read-only client for the mge.tf public league API (formats, regions, seasons, divisions, standings, placements, teams, matches, players). Use these tools for league questions. Do not query the production database and do not read .env.production. Public reads send no API key. Format codes are 1v1 and 2v2. Player ids are 17-digit Steam64 strings. current=true on list_seasons is the active signup season. Pending matches are list_matches with status unplayed. Lists return 50 rows per page. This server cannot change data, payments, Discord links, staff roles, or logs.';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

export type McpDispatch = { kind: 'json'; body: unknown } | { kind: 'empty' };

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const page = {
  type: 'integer',
  minimum: 1,
  maximum: 10_000,
  description: 'Page number. Growing lists return 50 rows.',
};

const format = {
  type: 'string',
  description: 'Public format code, such as 1v1 or 2v2. Matched case-sensitively.',
};

function idProp(description: string) {
  return { type: 'integer', minimum: 1, description };
}

const TOOLS: McpToolDef[] = [
  {
    name: 'list_formats',
    description:
      'List league formats. Each row has id, code, name, and isIndividual. Use code in other tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_regions',
    description: 'List visible regions. Hidden regions are omitted. Each row has id and name.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_seasons',
    description:
      'List seasons. current=true returns the active signup season whose region is visible. An unknown format code is rejected. An unknown regionId returns an empty page.',
    inputSchema: {
      type: 'object',
      properties: {
        regionId: idProp('Region id from list_regions.'),
        format,
        current: {
          type: 'boolean',
          description: 'When true, only the active signup season in a visible region.',
        },
        page,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_season',
    description:
      'Get one season: number, weeks, matchWeek, signupsOpen, rosterLocked, matchDeadline, region, and format. A season in a hidden region is not found.',
    inputSchema: {
      type: 'object',
      properties: { seasonId: idProp('Season id.') },
      required: ['seasonId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_divisions',
    description: 'List the visible divisions of one season. Each row has id and name.',
    inputSchema: {
      type: 'object',
      properties: { seasonId: idProp('Season id.') },
      required: ['seasonId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_standings',
    description:
      'Standings for a season, matching the public league page. Only READY teams receive a rank. Omitting divisionId appends an unplaced group with no ranks. points is average points scored per game.',
    inputSchema: {
      type: 'object',
      properties: {
        seasonId: idProp('Season id.'),
        divisionId: idProp('Division id. Omit to include every division plus an unplaced group.'),
      },
      required: ['seasonId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_placements',
    description:
      'Placement results for a season: place, division, team, and players. Ordered by division, then place.',
    inputSchema: {
      type: 'object',
      properties: {
        seasonId: idProp('Season id.'),
        divisionId: idProp('Division id. Omit for every division in the season.'),
      },
      required: ['seasonId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_teams',
    description:
      'List team cards, including 1v1. Ordered by id. A card has id, name, acronym, avatar, status, wins, losses, format, region, division, and season. Pages hold 50 teams.',
    inputSchema: {
      type: 'object',
      properties: {
        seasonId: idProp('Season id.'),
        divisionId: idProp('Division id.'),
        status: {
          type: 'string',
          enum: ['dead', 'unready', 'pending', 'ready', 'placement'],
          description: 'Team status.',
        },
        page,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_team',
    description:
      'Get one team. Adds gamesWon, gamesLost, pointsScored, pointsScoredAgainst, and players to the team card. 1v1 is a team of one.',
    inputSchema: {
      type: 'object',
      properties: { teamId: idProp('Team id.') },
      required: ['teamId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_matches',
    description:
      'List matches. Filters are combined. player matches an active roster on either side. home and away each include players. score is home/away, or null when unplayed. Pass seasonId when the current season is already known. Pages hold 50 matches.',
    inputSchema: {
      type: 'object',
      properties: {
        player: {
          type: 'string',
          pattern: '^\\d{17}$',
          description: '17-digit Steam64 of a player on either team. STEAM_0:Y:Z is rejected.',
        },
        status: {
          type: 'string',
          enum: ['unplayed', 'played', 'dispute'],
          description: 'Match status. Use unplayed for matches that have not been reported.',
        },
        seasonId: idProp('Season id.'),
        teamId: idProp('Team id. Matches either home or away.'),
        week: idProp('Match week number.'),
        divisionId: idProp('Division id, taken from the home team.'),
        page,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_match',
    description:
      'Get one match, including boSeries, boGames, and games (number, homeScore, awayScore, arena). winnerId is the winning team id.',
    inputSchema: {
      type: 'object',
      properties: { matchId: idProp('Match id.') },
      required: ['matchId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_player',
    description:
      'Get the league player for a Steam64: name, avatar, banStatus, and teams (team card plus active). Teams in a hidden region are omitted. Discord, permission level, and payments are not included. Not found when there is no user row.',
    inputSchema: {
      type: 'object',
      properties: {
        steamId: {
          type: 'string',
          pattern: '^\\d{17}$',
          description: '17-digit Steam64 id. Pass a string. STEAM_0:Y:Z is rejected.',
        },
      },
      required: ['steamId'],
      additionalProperties: false,
    },
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalId(args: Record<string, unknown>, key: string): number | undefined {
  if (args[key] === undefined) return undefined;
  return requiredId(args, key);
}

function requiredId(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (value === undefined) throw new Error(`Missing ${key}`);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid ${key}`);
  }
  return value;
}

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function toolText(data: unknown, isError = false) {
  return {
    content: [
      { type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) },
    ],
    isError,
  };
}

function negotiateProtocol(requested: unknown): string {
  return typeof requested === 'string' && PROTOCOL_VERSIONS.has(requested)
    ? requested
    : DEFAULT_PROTOCOL;
}

function toolErrorMessage(err: unknown): string {
  if (err instanceof LeagueApiError) {
    if (err.status === 403) {
      return `HTTP 403: ${err.message} Staging (dev.mge.tf) blocks /api for non-staff. Use https://mge.tf or a local dev server.`;
    }
    if (err.status === 429) {
      const retry = err.retryAfter ? ` Retry after ${err.retryAfter} seconds.` : '';
      return `HTTP 429: ${err.message}${retry}`;
    }
    if (err.status === 0) return err.message;
    return `HTTP ${err.status}: ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return 'League API request failed';
}

async function callTool(
  api: LeagueApi,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'list_formats':
      return api.listFormats();
    case 'list_regions':
      return api.listRegions();
    case 'list_seasons':
      return api.listSeasons({
        regionId: optionalId(args, 'regionId'),
        format: strArg(args, 'format'),
        current: args.current === true ? true : undefined,
        page: optionalId(args, 'page'),
      });
    case 'get_season':
      return api.getSeason(requiredId(args, 'seasonId'));
    case 'list_divisions':
      return api.listDivisions(requiredId(args, 'seasonId'));
    case 'get_standings':
      return api.getStandings(requiredId(args, 'seasonId'), {
        divisionId: optionalId(args, 'divisionId'),
      });
    case 'get_placements':
      return api.getPlacements(requiredId(args, 'seasonId'), {
        divisionId: optionalId(args, 'divisionId'),
      });
    case 'list_teams':
      return api.listTeams({
        seasonId: optionalId(args, 'seasonId'),
        divisionId: optionalId(args, 'divisionId'),
        status: strArg(args, 'status'),
        page: optionalId(args, 'page'),
      });
    case 'get_team':
      return api.getTeam(requiredId(args, 'teamId'));
    case 'list_matches':
      return api.listMatches({
        player: strArg(args, 'player'),
        status: strArg(args, 'status'),
        seasonId: optionalId(args, 'seasonId'),
        teamId: optionalId(args, 'teamId'),
        week: optionalId(args, 'week'),
        divisionId: optionalId(args, 'divisionId'),
        page: optionalId(args, 'page'),
      });
    case 'get_match':
      return api.getMatch(requiredId(args, 'matchId'));
    case 'get_player': {
      const steamId = strArg(args, 'steamId');
      if (!steamId) throw new Error('Missing steamId');
      return api.getPlayer(steamId);
    }
    default:
      throw new Error(`Unknown tool "${name}"`);
  }
}

export async function dispatchMcp(message: unknown, api: LeagueApi): Promise<McpDispatch> {
  if (typeof message !== 'object' || message === null) {
    return { kind: 'json', body: rpcError(null, -32600, 'Invalid Request') };
  }

  const req = message as JsonRpcRequest;
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return { kind: 'json', body: rpcError(req.id ?? null, -32600, 'Invalid Request') };
  }

  if (req.method.startsWith('notifications/')) {
    return { kind: 'empty' };
  }

  switch (req.method) {
    case 'initialize': {
      const params = asRecord(req.params);
      return {
        kind: 'json',
        body: rpcResult(req.id, {
          protocolVersion: negotiateProtocol(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'mge-league', version: MCP_VERSION },
          instructions: INSTRUCTIONS,
        }),
      };
    }
    case 'ping':
      return { kind: 'json', body: rpcResult(req.id, {}) };
    case 'tools/list':
      return { kind: 'json', body: rpcResult(req.id, { tools: TOOLS }) };
    case 'tools/call': {
      const params = asRecord(req.params);
      const name = typeof params.name === 'string' ? params.name : '';
      const args = asRecord(params.arguments);
      if (!name) {
        return { kind: 'json', body: rpcError(req.id ?? null, -32602, 'Missing tool name') };
      }
      try {
        const result = await callTool(api, name, args);
        return { kind: 'json', body: rpcResult(req.id, toolText(result)) };
      } catch (err) {
        return { kind: 'json', body: rpcResult(req.id, toolText(toolErrorMessage(err), true)) };
      }
    }
    default:
      return {
        kind: 'json',
        body: rpcError(req.id ?? null, -32601, `Method not found: ${req.method}`),
      };
  }
}
