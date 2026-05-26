import { prisma } from '$lib/server/db';
import { Prisma } from '$prisma/client.js';
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
  const existing = await prisma.matchLog.findUnique({ where: { mgeMatchId } });
  if (existing) {
    const existingPreview =
      (existing.preview as MatchPreview | null) ??
      buildPreview(existing.parsedData as unknown as ParsedMatch);
    return toSummary(existing, existingPreview);
  }

  const parsed = await callParser(logText);

  const rawLogKey = `logs/${mgeMatchId}.log`;
  await uploadBufferToR2(Buffer.from(logText, 'utf-8'), rawLogKey, 'text/plain');

  const playerNames = parsed.players.map((p) => p.name);
  const preview = buildPreview(parsed);

  const row = await prisma.matchLog.create({
    data: {
      mgeMatchId,
      rawLogKey,
      parsedData: parsed as object,
      players: playerNames,
      preview: preview === null ? Prisma.DbNull : (preview as unknown as Prisma.InputJsonValue),
      hostname: hostname ?? null,
      map: parsed.meta.map,
      arena: parsed.meta.arena ?? null,
      gamemode: parsed.meta.gamemode,
      format: parsed.meta.format,
      aborted: parsed.meta.aborted,
      startedAt: parsed.meta.startedAt ? new Date(parsed.meta.startedAt) : null,
      endedAt: parsed.meta.endedAt ? new Date(parsed.meta.endedAt) : null,
      durationSec: parsed.meta.durationSeconds ?? null,
    },
  });

  return toSummary(row, preview);
}

export async function getMatchLog(id: number): Promise<MatchLogDetail> {
  const row = await prisma.matchLog.findUnique({ where: { id } });
  if (!row) notFound('Match log not found');

  const parsed = row.parsedData as unknown as ParsedMatch;
  const preview = (row.preview as MatchPreview | null) ?? buildPreview(parsed);
  return {
    ...toSummary(row, preview),
    parsedData: parsed,
    rawLogKey: row.rawLogKey,
  };
}

export async function listMatchLogsByPlayer(
  steamId: string,
  page: number = 1,
): Promise<{
  logs: MatchLogSummary[];
  total: number;
  totalPages: number;
}> {
  const skip = (page - 1) * LOGS_PER_PAGE;

  const steamId3 = steamId3FromSteamId64(steamId);
  const jsonbFilter = JSON.stringify({ players: [{ steamId: steamId3 }] });

  // Prisma's path+array_contains JSON filter generates incorrect SQL for nested array object matching.
  // Raw SQL with PostgreSQL's @> (JSONB containment) operator is required here.
  const [idRows, totalRows] = await Promise.all([
    prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM match_logs
      WHERE parsed_data @> ${jsonbFilter}::jsonb
      ORDER BY uploaded_at DESC
      LIMIT ${LOGS_PER_PAGE} OFFSET ${skip}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM match_logs
      WHERE parsed_data @> ${jsonbFilter}::jsonb
    `,
  ]);

  const total = Number(totalRows[0]?.count ?? 0n);
  const ids = idRows.map((r) => r.id);

  if (ids.length === 0) {
    return { logs: [], total, totalPages: Math.ceil(total / LOGS_PER_PAGE) };
  }

  const rows = await prisma.matchLog.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      mgeMatchId: true,
      hostname: true,
      map: true,
      arena: true,
      gamemode: true,
      format: true,
      aborted: true,
      players: true,
      durationSec: true,
      startedAt: true,
      endedAt: true,
      uploadedAt: true,
      preview: true,
    },
  });

  // Restore the order from the raw SQL query (uploaded_at DESC)
  const idOrder = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  return {
    logs: rows.map((row) => toSummary(row, row.preview as MatchPreview | null)),
    total,
    totalPages: Math.ceil(total / LOGS_PER_PAGE),
  };
}

export async function listMatchLogs(page: number = 1): Promise<{
  logs: MatchLogSummary[];
  total: number;
  totalPages: number;
}> {
  const skip = (page - 1) * LOGS_PER_PAGE;

  const [rows, total] = await Promise.all([
    prisma.matchLog.findMany({
      orderBy: { uploadedAt: 'desc' },
      skip,
      take: LOGS_PER_PAGE,
      select: {
        id: true,
        mgeMatchId: true,
        hostname: true,
        map: true,
        arena: true,
        gamemode: true,
        format: true,
        aborted: true,
        players: true,
        durationSec: true,
        startedAt: true,
        endedAt: true,
        uploadedAt: true,
        preview: true,
      },
    }),
    prisma.matchLog.count(),
  ]);

  return {
    logs: rows.map((row) => toSummary(row, row.preview as MatchPreview | null)),
    total,
    totalPages: Math.ceil(total / LOGS_PER_PAGE),
  };
}

export function getLogPublicUrl(id: number): string {
  return `/logs/${id}`;
}

export function getRawLogUrl(rawLogKey: string): string | null {
  return getPublicUrl(rawLogKey);
}
