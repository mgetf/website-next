import { prisma } from '$lib/server/db';
import { Prisma } from '$prisma/client.js';
import { fetchLogsTfTotalCount } from '$lib/server/clients/logsTf';
import { getPlayerClasselo, getPlayerRatings } from '$lib/server/clients/mgePlatform';
import { fetchSteamAccountSignals } from '$lib/server/clients/steam';
import {
  getPlayerInvestigation,
  isPlayerInvestigationConfigured,
} from '$lib/server/services/playerInvestigation';
import { tfClassById } from '$lib/constants/tfClasses';
import type { SteamInvestigation } from '$lib/types/investigation';
import type { MgeClasseloRating, MgeRating } from '$lib/types/mge';
import type {
  ProfilingClassScore,
  ProfilingRegionScore,
  ProfilingSnapshot,
} from '$lib/types/profiling';
import {
  emptyProfilingSnapshot,
  parseProfilingSnapshot,
  profilingSnapshotFacts,
} from '$lib/utils/profiling';
import { isSteamId64, steamId64FromAnyFormat } from '$lib/utils/steamid';

const INVESTIGATE_TIMEOUT_MS = 8000;
const BATCH_LIMIT = 200;
const BATCH_CONCURRENCY = 6;

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } catch {
    return fallback;
  }
}

function playedRating<T extends { wins: number | null; losses: number | null }>(
  rating: T,
): boolean {
  return (rating.wins ?? 0) + (rating.losses ?? 0) >= 1;
}

function regionScores(ratings: MgeRating[]): ProfilingRegionScore[] {
  return ratings
    .filter(playedRating)
    .map((rating) => ({ region: rating.region, score: rating.elo }))
    .sort((a, b) => b.score - a.score);
}

function classScores(ratings: MgeClasseloRating[]): ProfilingClassScore[] {
  return ratings
    .filter(playedRating)
    .map((rating) => ({
      classId: rating.class,
      className: rating.className || tfClassById(rating.class)?.label || `Class ${rating.class}`,
      region: rating.region,
      score: rating.elo,
    }))
    .sort((a, b) => b.score - a.score);
}

async function loadInvestigation(
  steamId: string,
  prefetched?: SteamInvestigation | null,
): Promise<SteamInvestigation | null> {
  if (prefetched) return prefetched;
  if (!isPlayerInvestigationConfigured()) return null;
  const result = await withTimeout(getPlayerInvestigation(steamId), INVESTIGATE_TIMEOUT_MS, null);
  if (result?.kind === 'steam') return result;
  return null;
}

async function gatherSnapshot(
  steamId: string,
  investigation: SteamInvestigation | null,
): Promise<ProfilingSnapshot> {
  const snapshot = emptyProfilingSnapshot();
  const [steam, ratings, classelo, logsCount] = await Promise.all([
    fetchSteamAccountSignals(steamId),
    withTimeout(getPlayerRatings(steamId), 5000, []),
    withTimeout(getPlayerClasselo(steamId), 5000, []),
    fetchLogsTfTotalCount(steamId),
  ]);

  snapshot.steamAgeYears = steam.steamAgeYears;
  snapshot.steamCreatedAt = steam.steamCreatedAt;
  snapshot.steamLevel = steam.steamLevel;
  snapshot.gameCount = steam.gameCount;
  snapshot.tf2Hours = steam.tf2Hours;
  snapshot.profilePublic = steam.profilePublic;
  snapshot.scores = regionScores(ratings);
  snapshot.classScores = classScores(classelo);
  snapshot.logsTfCount = logsCount;
  snapshot.mgeServerHours =
    investigation && Number.isFinite(investigation.totalSeconds)
      ? investigation.totalSeconds / 3600
      : null;

  return snapshot;
}

async function readCachedSnapshot(steamId: string): Promise<ProfilingSnapshot | null> {
  const row = await prisma.profilingCache.findUnique({ where: { steamId } });
  if (!row) return null;
  return parseProfilingSnapshot(row.snapshot, row.updatedAt.toISOString());
}

async function writeCachedSnapshot(
  steamId: string,
  snapshot: ProfilingSnapshot,
): Promise<ProfilingSnapshot> {
  const row = await prisma.profilingCache.upsert({
    where: { steamId },
    create: {
      steamId,
      snapshot: profilingSnapshotFacts(snapshot) as Prisma.InputJsonValue,
    },
    update: {
      snapshot: profilingSnapshotFacts(snapshot) as Prisma.InputJsonValue,
    },
  });
  return { ...snapshot, cachedAt: row.updatedAt.toISOString() };
}

export async function getPlayerProfiling(
  steamId: string,
  options: { investigation?: SteamInvestigation | null; refresh?: boolean } = {},
): Promise<ProfilingSnapshot | null> {
  const resolved = isSteamId64(steamId) ? steamId : steamId64FromAnyFormat(steamId);
  if (!resolved) return null;

  if (!options.refresh) {
    const cached = await readCachedSnapshot(resolved);
    if (cached) return cached;
  }

  const investigation = await loadInvestigation(resolved, options.investigation);
  const snapshot = await gatherSnapshot(resolved, investigation);
  return writeCachedSnapshot(resolved, snapshot);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function getPlayerProfilingBatch(
  steamIds: string[],
): Promise<Record<string, ProfilingSnapshot | null>> {
  const unique = [...new Set(steamIds.filter((id) => isSteamId64(id)))].slice(0, BATCH_LIMIT);
  const snapshots: Record<string, ProfilingSnapshot | null> = {};
  if (unique.length === 0) return snapshots;

  const rows = await prisma.profilingCache.findMany({
    where: { steamId: { in: unique } },
  });
  for (const row of rows) {
    const parsed = parseProfilingSnapshot(row.snapshot, row.updatedAt.toISOString());
    if (parsed) snapshots[row.steamId] = parsed;
  }

  const missing = unique.filter((steamId) => snapshots[steamId] == null);
  await mapLimit(missing, BATCH_CONCURRENCY, async (steamId) => {
    try {
      snapshots[steamId] = await getPlayerProfiling(steamId);
    } catch {
      snapshots[steamId] = null;
    }
  });
  return snapshots;
}
