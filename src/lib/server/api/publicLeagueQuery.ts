/**
 * Query parsing for the public league read API.
 * Throws PublicQueryError for bad input and PublicNotFoundError for missing resources.
 */

export class PublicQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicQueryError';
  }
}

export class PublicNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicNotFoundError';
  }
}

export const PUBLIC_PAGE_SIZE = 50;

const STEAM_ID = /^\d{17}$/;
const FORMAT_CODE = /^[a-z0-9][a-z0-9-]{0,31}$/i;

const TEAM_STATUS = ['dead', 'unready', 'pending', 'ready', 'placement'] as const;
const MATCH_STATUS = ['unplayed', 'played', 'dispute'] as const;

export type PublicTeamStatus = (typeof TEAM_STATUS)[number];
export type PublicMatchStatus = (typeof MATCH_STATUS)[number];

export type SeasonListQuery = {
  regionId?: number;
  format?: string;
  current: boolean;
  page: number;
};

export type TeamListQuery = {
  seasonId?: number;
  divisionId?: number;
  status?: PublicTeamStatus;
  page: number;
};

export type MatchListQuery = {
  player?: string;
  status?: PublicMatchStatus;
  seasonId?: number;
  teamId?: number;
  week?: number;
  divisionId?: number;
  page: number;
};

export type DivisionFilterQuery = {
  divisionId?: number;
};

function field(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  if (!value) return undefined;
  return value;
}

function positiveInt(value: string | undefined, label: string): number | undefined {
  if (value == null) return undefined;
  if (!/^\d+$/.test(value)) throw new PublicQueryError(`Invalid ${label}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new PublicQueryError(`Invalid ${label}`);
  return parsed;
}

function pageNumber(params: URLSearchParams): number {
  const page = positiveInt(field(params, 'page'), 'page') ?? 1;
  if (page > 10_000) throw new PublicQueryError('Invalid page');
  return page;
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string,
): T | undefined {
  if (value == null) return undefined;
  const normalized = value.toLowerCase();
  if (!(allowed as readonly string[]).includes(normalized)) {
    throw new PublicQueryError(`Invalid ${label}`);
  }
  return normalized as T;
}

export function pathId(raw: string | undefined, label: string): number {
  const id = positiveInt(raw?.trim(), label);
  if (id == null) throw new PublicQueryError(`Invalid ${label}`);
  return id;
}

export function pathSteamId(raw: string | undefined): string {
  const steamId = raw?.trim();
  if (steamId == null || !STEAM_ID.test(steamId)) throw new PublicQueryError('Invalid steamId');
  return steamId;
}

export function parseSeasonListQuery(params: URLSearchParams): SeasonListQuery {
  const currentRaw = field(params, 'current');
  if (currentRaw != null && currentRaw !== 'true' && currentRaw !== 'false') {
    throw new PublicQueryError('Invalid current');
  }
  const format = field(params, 'format');
  if (format != null && !FORMAT_CODE.test(format)) {
    throw new PublicQueryError('Invalid format');
  }
  return {
    regionId: positiveInt(field(params, 'regionId'), 'regionId'),
    format,
    current: currentRaw === 'true',
    page: pageNumber(params),
  };
}

export function parseTeamListQuery(params: URLSearchParams): TeamListQuery {
  return {
    seasonId: positiveInt(field(params, 'seasonId'), 'seasonId'),
    divisionId: positiveInt(field(params, 'divisionId'), 'divisionId'),
    status: oneOf(field(params, 'status'), TEAM_STATUS, 'status'),
    page: pageNumber(params),
  };
}

export function parseMatchListQuery(params: URLSearchParams): MatchListQuery {
  const player = field(params, 'player');
  if (player != null && !STEAM_ID.test(player)) throw new PublicQueryError('Invalid player');
  return {
    player,
    status: oneOf(field(params, 'status'), MATCH_STATUS, 'status'),
    seasonId: positiveInt(field(params, 'seasonId'), 'seasonId'),
    teamId: positiveInt(field(params, 'teamId'), 'teamId'),
    week: positiveInt(field(params, 'week'), 'week'),
    divisionId: positiveInt(field(params, 'divisionId'), 'divisionId'),
    page: pageNumber(params),
  };
}

export function parseDivisionFilterQuery(params: URLSearchParams): DivisionFilterQuery {
  return {
    divisionId: positiveInt(field(params, 'divisionId'), 'divisionId'),
  };
}
