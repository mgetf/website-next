#!/usr/bin/env bun
/**
 * Reparse match logs that lost a player because the old parser could not
 * handle Steam names containing `<` (for example `< blank >`).
 *
 * Finds 1v1 rows with fewer than 2 parsed players and 2v2 rows with fewer
 * than 4, downloads the raw log from R2, posts it to the parser, and writes
 * `parsed_data` / `players` / `preview` back to Postgres.
 *
 * Usage:
 *   bun run scripts/reparse-dropped-player-logs.ts
 *   bun run scripts/reparse-dropped-player-logs.ts --prod
 *   bun run scripts/reparse-dropped-player-logs.ts --prod --matchid 2608312217159a89
 *   bun run scripts/reparse-dropped-player-logs.ts --prod --apply
 *   bun run scripts/reparse-dropped-player-logs.ts --prod --apply --limit 20
 *
 * Default is dry-run. `--apply` writes. `--prod` loads `.env.production`.
 */

import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../prisma/generated/client';
import type {
  MatchPreview,
  MatchPreviewSide,
  ParsedMatch,
  PlayerRecord,
} from '../src/lib/types/matchLog';

const apply = process.argv.includes('--apply');
const prod = process.argv.includes('--prod');

config({ path: prod ? '.env.production' : '.env', override: true });

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

const matchIdFilter = argValue('--matchid');
const limitRaw = argValue('--limit');
const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
if (limitRaw && (!Number.isFinite(limit) || (limit ?? 0) <= 0)) {
  throw new Error('--limit must be a positive integer');
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const parserUrl = (process.env.PARSER_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const publicBase = process.env.CLOUDFLARE_PUBLIC_URL?.replace(/\/$/, '');
if (!publicBase) {
  throw new Error('CLOUDFLARE_PUBLIC_URL environment variable is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 1 }),
});

type Candidate = {
  id: number;
  mgeMatchId: string;
  rawLogKey: string;
  format: string;
  aborted: boolean;
  playerCount: number;
};

function sideFromPlayers(group: PlayerRecord[]): MatchPreviewSide | null {
  if (group.length === 0) return null;
  return {
    names: group.map((p) => p.name),
    classes: group.map((p) => p.startClass),
    score: Math.max(...group.map((p) => p.score)),
    team: group[0]!.team,
  };
}

function buildPreview(parsed: ParsedMatch): MatchPreview | null {
  if (parsed.meta.aborted) {
    const red = sideFromPlayers(parsed.players.filter((p) => p.team === 'Red'));
    const blu = sideFromPlayers(parsed.players.filter((p) => p.team === 'Blue'));
    if (!red || !blu) return null;
    return { winner: red, loser: blu };
  }

  const winners = parsed.players.filter((p) => p.won);
  const losers = parsed.players.filter((p) => !p.won);
  const winner = sideFromPlayers(winners);
  const loser = sideFromPlayers(losers);
  if (!winner || !loser) return null;
  return { winner, loser };
}

function expectedPlayerCount(format: string): number {
  return format === '2v2' ? 4 : 2;
}

function rawLogUrl(rawLogKey: string): string {
  return `${publicBase}/${rawLogKey}`;
}

async function fetchRawLog(rawLogKey: string): Promise<string> {
  const res = await fetch(rawLogUrl(rawLogKey));
  if (!res.ok) {
    throw new Error(`raw log fetch failed (${res.status}) ${rawLogUrl(rawLogKey)}`);
  }
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`raw log empty ${rawLogUrl(rawLogKey)}`);
  }
  return text;
}

async function parseLog(logText: string): Promise<ParsedMatch> {
  const res = await fetch(`${parserUrl}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: logText,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown parser error' }));
    throw new Error((body as { error?: string }).error ?? `parser returned ${res.status}`);
  }
  return res.json() as Promise<ParsedMatch>;
}

async function loadCandidates(): Promise<Candidate[]> {
  if (matchIdFilter) {
    return prisma.$queryRaw<Candidate[]>`
      SELECT
        id,
        mge_match_id AS "mgeMatchId",
        raw_log_key AS "rawLogKey",
        format,
        aborted,
        jsonb_array_length(COALESCE(parsed_data->'players', '[]'::jsonb)) AS "playerCount"
      FROM match_logs
      WHERE mge_match_id = ${matchIdFilter}
    `;
  }

  const rows = await prisma.$queryRaw<Candidate[]>`
    SELECT
      id,
      mge_match_id AS "mgeMatchId",
      raw_log_key AS "rawLogKey",
      format,
      aborted,
      jsonb_array_length(COALESCE(parsed_data->'players', '[]'::jsonb)) AS "playerCount"
    FROM match_logs
    WHERE
      (format = '1v1' AND jsonb_array_length(COALESCE(parsed_data->'players', '[]'::jsonb)) < 2)
      OR (format = '2v2' AND jsonb_array_length(COALESCE(parsed_data->'players', '[]'::jsonb)) < 4)
    ORDER BY id ASC
  `;

  if (limit) return rows.slice(0, limit);
  return rows;
}

async function main(): Promise<void> {
  console.log(
    [
      apply ? 'apply (writes enabled)' : 'dry-run (no writes)',
      prod ? 'env=.env.production' : 'env=.env',
      `parser=${parserUrl}`,
      matchIdFilter ? `matchid=${matchIdFilter}` : null,
      limit ? `limit=${limit}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
  );

  const candidates = await loadCandidates();
  console.log(`candidates: ${candidates.length}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    const expected = expectedPlayerCount(row.format);
    const prefix = `#${row.id} ${row.mgeMatchId} (${row.format}, players=${row.playerCount})`;

    try {
      const logText = await fetchRawLog(row.rawLogKey);
      const parsed = await parseLog(logText);
      const afterCount = parsed.players.length;
      const names = parsed.players.map((p) => p.name).join(' vs ');
      const stillShort = afterCount < expected;

      if (stillShort) {
        console.log(
          `  ${prefix} still short after parse (${afterCount} < ${expected}) names=${JSON.stringify(parsed.players.map((p) => p.name))}`,
        );
        skipped += 1;
        continue;
      }

      if (!apply) {
        console.log(`  [dry-run] ${prefix} -> ${afterCount} players (${names})`);
        ok += 1;
        continue;
      }

      const preview = buildPreview(parsed);
      await prisma.matchLog.update({
        where: { id: row.id },
        data: {
          parsedData: parsed as object,
          players: parsed.players.map((p) => p.name),
          preview: preview === null ? Prisma.DbNull : (preview as unknown as Prisma.InputJsonValue),
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
      console.log(`  updated ${prefix} -> ${afterCount} players (${names})`);
      ok += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  FAIL ${prefix}: ${message}`);
    }
  }

  console.log(`done. ok=${ok} skipped=${skipped} failed=${failed}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
