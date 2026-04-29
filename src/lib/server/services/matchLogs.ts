import { prisma } from '$lib/server/db';
import { uploadBufferToR2, getPublicUrl } from '$lib/server/utils/r2Upload';
import { getParserUrl } from '$lib/server/utils/env';
import { notFound } from '$lib/server/utils/errors';
import type { ParsedMatch, MatchLogSummary, MatchLogDetail } from '$lib/types/matchLog';

const LOGS_PER_PAGE = 50;

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

function toSummary(row: {
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
}): MatchLogSummary {
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
    return toSummary(existing);
  }

  const parsed = await callParser(logText);

  const rawLogKey = `logs/${mgeMatchId}.log`;
  await uploadBufferToR2(Buffer.from(logText, 'utf-8'), rawLogKey, 'text/plain');

  const playerNames = parsed.players.map((p) => p.name);

  const row = await prisma.matchLog.create({
    data: {
      mgeMatchId,
      rawLogKey,
      parsedData: parsed as object,
      players: playerNames,
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

  return toSummary(row);
}

export async function getMatchLog(id: number): Promise<MatchLogDetail> {
  const row = await prisma.matchLog.findUnique({ where: { id } });
  if (!row) notFound('Match log not found');

  return {
    ...toSummary(row),
    parsedData: row.parsedData as unknown as ParsedMatch,
    rawLogKey: row.rawLogKey,
  };
}

export async function listMatchLogs(page: number = 1): Promise<{
  logs: MatchLogSummary[];
  total: number;
  totalPages: number;
}> {
  const skip = (page - 1) * LOGS_PER_PAGE;

  const [rows, total] = await prisma.$transaction([
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
      },
    }),
    prisma.matchLog.count(),
  ]);

  return {
    logs: rows.map(toSummary),
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
