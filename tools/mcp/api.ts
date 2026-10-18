/**
 * HTTP client for the public league reads under /api/v1.
 * Sends no API key. No database access. See docs/public-league-api.md.
 */

const DEFAULT_BASE = 'https://mge.tf';

export const MCP_VERSION = '0.1.0';

export class LeagueApiError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;

  constructor(message: string, status: number, retryAfter: string | null = null) {
    super(message);
    this.name = 'LeagueApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function resolveApiBase(raw?: string): string {
  const value = (raw ?? process.env.MGE_API_BASE)?.trim() || DEFAULT_BASE;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`MGE_API_BASE is not a valid URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('MGE_API_BASE must use http or https');
  }
  if (url.username || url.password) {
    throw new Error('MGE_API_BASE must not include credentials');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MGE_API_BASE must be an origin, without a path, query, or hash');
  }
  return url.origin;
}

export function leagueResourcePath(path: string): string {
  if (!path.startsWith('/api/v1/') || path.includes('..') || path.includes('//')) {
    throw new Error(`Refusing league API path: ${path}`);
  }
  return path;
}

type QueryValue = string | number | boolean | undefined;

export function toQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export type LeagueFetch = (input: string, init: RequestInit) => Promise<Response>;

export type SeasonListParams = {
  regionId?: number;
  format?: string;
  current?: boolean;
  page?: number;
};

export type TeamListParams = {
  seasonId?: number;
  divisionId?: number;
  status?: string;
  page?: number;
};

export type MatchListParams = {
  player?: string;
  status?: string;
  seasonId?: number;
  teamId?: number;
  week?: number;
  divisionId?: number;
  page?: number;
};

export type DivisionFilterParams = {
  divisionId?: number;
};

function idSegment(id: number, label: string): string {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`Invalid ${label}`);
  return String(id);
}

function steam64(value: string): string {
  if (!/^\d{17}$/.test(value)) throw new Error('Invalid steamId');
  return value;
}

export class LeagueApi {
  readonly baseUrl: string;
  private readonly fetchImpl: LeagueFetch;

  constructor(options?: { baseUrl?: string; fetchImpl?: LeagueFetch }) {
    this.baseUrl = resolveApiBase(options?.baseUrl);
    this.fetchImpl = options?.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  listFormats(): Promise<unknown> {
    return this.get('/api/v1/formats');
  }

  listRegions(): Promise<unknown> {
    return this.get('/api/v1/regions');
  }

  listSeasons(query: SeasonListParams = {}): Promise<unknown> {
    return this.get(
      `/api/v1/seasons${toQuery({
        regionId: query.regionId,
        format: query.format,
        current: query.current ? true : undefined,
        page: query.page,
      })}`,
    );
  }

  getSeason(seasonId: number): Promise<unknown> {
    return this.get(`/api/v1/seasons/${idSegment(seasonId, 'season id')}`);
  }

  listDivisions(seasonId: number): Promise<unknown> {
    return this.get(`/api/v1/seasons/${idSegment(seasonId, 'season id')}/divisions`);
  }

  getStandings(seasonId: number, query: DivisionFilterParams = {}): Promise<unknown> {
    return this.get(
      `/api/v1/seasons/${idSegment(seasonId, 'season id')}/standings${toQuery({
        divisionId: query.divisionId,
      })}`,
    );
  }

  getPlacements(seasonId: number, query: DivisionFilterParams = {}): Promise<unknown> {
    return this.get(
      `/api/v1/seasons/${idSegment(seasonId, 'season id')}/placements${toQuery({
        divisionId: query.divisionId,
      })}`,
    );
  }

  listTeams(query: TeamListParams = {}): Promise<unknown> {
    return this.get(
      `/api/v1/teams${toQuery({
        seasonId: query.seasonId,
        divisionId: query.divisionId,
        status: query.status,
        page: query.page,
      })}`,
    );
  }

  getTeam(teamId: number): Promise<unknown> {
    return this.get(`/api/v1/teams/${idSegment(teamId, 'team id')}`);
  }

  listMatches(query: MatchListParams = {}): Promise<unknown> {
    return this.get(
      `/api/v1/matches${toQuery({
        player: query.player === undefined ? undefined : steam64(query.player),
        status: query.status,
        seasonId: query.seasonId,
        teamId: query.teamId,
        week: query.week,
        divisionId: query.divisionId,
        page: query.page,
      })}`,
    );
  }

  getMatch(matchId: number): Promise<unknown> {
    return this.get(`/api/v1/matches/${idSegment(matchId, 'match id')}`);
  }

  getPlayer(steamId: string): Promise<unknown> {
    return this.get(`/api/v1/players/${steam64(steamId)}`);
  }

  private get(path: string): Promise<unknown> {
    return this.request(path);
  }

  private async request(path: string): Promise<unknown> {
    const resource = leagueResourcePath(path);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${resource}`, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'application/json',
          'user-agent': `mge-mcp/${MCP_VERSION}`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'League API request failed';
      throw new LeagueApiError(message, 0);
    }

    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new LeagueApiError('The league API redirected the request', response.status || 302);
    }

    const parsed = await readBody(response);
    if (!response.ok) {
      throw new LeagueApiError(
        errorMessage(parsed) ?? 'League API request failed',
        response.status,
        response.headers.get('retry-after'),
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new LeagueApiError('League API returned a non-JSON body', response.status);
    }
    return parsed;
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  if ('error' in body && typeof body.error === 'string' && body.error.trim()) return body.error;
  if ('message' in body && typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }
  return undefined;
}
