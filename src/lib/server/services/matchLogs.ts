import { steamId3FromSteamId64 } from '$lib/utils/steamid';
import { uploadBufferToR2, getPublicUrl } from '$lib/server/utils/r2Upload';
import { getParserUrl } from '$lib/server/utils/env';
import { notFound } from '$lib/server/utils/errors';
import type {
  ParsedMatch,
  MatchLogSummary,
  MatchLogDetail,
  MatchPreview,
} from '$lib/types/matchLog';

const LOGS_PER_PAGE = 50;

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

function buildPreview(parsed: ParsedMatch): MatchPreview | null {
  if (parsed.meta.aborted) return null;
  const winners = parsed.players.filter((p) => p.won);
  const losers = parsed.players.filter((p) => !p.won);
  if (winners.length === 0 || losers.length === 0) return null;

  return {
    winner: {
      names: winners.map((p) => p.name),
      classes: winners.map((p) => p.startClass),
      score: Math.max(...winners.map((p) => p.score)),
      team: winners[0].team,
    },
    loser: {
      names: losers.map((p) => p.name),
      classes: losers.map((p) => p.startClass),
      score: Math.max(...losers.map((p) => p.score)),
      team: losers[0].team,
    },
  };
}

function toSummary(
  row: {
    id: number;
    mgeMatchId: string;
    hostname: string | null;
    map: string;
    arena: string | null;
    gamemode: string;
    format: string;
    aborted: boolean;
    players: unknown;
    durationSec: number | null;
    startedAt: Date | null;
    endedAt?: Date | null;
    uploadedAt: Date;
  },
  preview: MatchPreview | null,
): MatchLogSummary {
  return {
    id: row.id,
    mgeMatchId: row.mgeMatchId,
    hostname: row.hostname,
    map: row.map,
    arena: row.arena,
    gamemode: row.gamemode,
    format: row.format,
    aborted: row.aborted,
    players: Array.isArray(row.players) ? (row.players as string[]) : [],
    durationSec: row.durationSec,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    uploadedAt: row.uploadedAt.toISOString(),
    preview,
  };
}

async function callParser(logText: string): Promise<ParsedMatch> {
  const parserUrl = getParserUrl();
  const res = await fetch(`${parserUrl}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: logText,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown parser error' }));
    throw new ParseError((body as { error?: string }).error ?? 'parser returned an error');
  }

  return res.json() as Promise<ParsedMatch>;
}

export async function uploadMatchLog({
  mgeMatchId,
  logText,
  hostname,
}: {
  mgeMatchId: string;
  logText: string;
  hostname?: string;
}): Promise<MatchLogSummary> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Match log upload is not available under DATA_BACKEND=rama yet');
  }
  throw new Error('uploadMatchLog requires DATA_BACKEND=rama');
}

export async function getMatchLog(id: number): Promise<MatchLogDetail> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void id;
    notFound('Match log not found');
  }
  throw new Error('getMatchLog requires DATA_BACKEND=rama');
}

export async function listMatchLogsByPlayer(
  steamId: string,
  page: number = 1,
): Promise<{
  logs: MatchLogSummary[];
  total: number;
  totalPages: number;
}> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void steamId;
    void page;
    return { logs: [], total: 0, totalPages: 0 };
  }
  throw new Error('listMatchLogsByPlayer requires DATA_BACKEND=rama');
}

export async function listMatchLogs(page: number = 1): Promise<{
  logs: MatchLogSummary[];
  total: number;
  totalPages: number;
}> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void page;
    return { logs: [], total: 0, totalPages: 0 };
  }
  throw new Error('listMatchLogs requires DATA_BACKEND=rama');
}

export function getLogPublicUrl(id: number): string {
  return `/logs/${id}`;
}

export function getRawLogUrl(rawLogKey: string): string | null {
  return getPublicUrl(rawLogKey);
}
