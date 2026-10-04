import { prisma } from '$lib/server/db';
import { fetchLogsTfRecentCount } from '$lib/server/clients/logsTf';
import { getPlayerClasselo, getPlayerRatings } from '$lib/server/clients/mgePlatform';
import { fetchSteamAccountSignals } from '$lib/server/clients/steam';
import {
  getPlayerInvestigation,
  isPlayerInvestigationConfigured,
} from '$lib/server/services/playerInvestigation';
import { getProfilingSettings } from '$lib/server/services/profilingSettings';
import type { SteamInvestigation } from '$lib/types/investigation';
import type {
  ProfilingAltLink,
  ProfilingBanStatus,
  ProfilingRawSignals,
  ProfilingScores,
} from '$lib/types/profiling';
import { emptyProfilingRaw, scoreProfile } from '$lib/utils/profiling';
import { isSteamId64, steamId64FromAnyFormat } from '$lib/utils/steamid';

const CACHE_TTL_MS = 3 * 60 * 1000;
const INVESTIGATE_TIMEOUT_MS = 8000;

type CacheEntry = { expires: number; scores: ProfilingScores };

const profileCache = new Map<string, CacheEntry>();

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

function cacheKey(steamId: string, settingsUpdatedAt: string | null): string {
  return `${steamId}:${settingsUpdatedAt ?? 'defaults'}`;
}

function pickBestRating<T extends { elo: number; wins: number | null; losses: number | null }>(
  ratings: T[],
): T | null {
  const visible = ratings
    .filter((rating) => (rating.wins ?? 0) + (rating.losses ?? 0) >= 1)
    .slice()
    .sort((a, b) => b.elo - a.elo);
  return visible[0] ?? null;
}

function pastDivisionSkill(sortOrder: number, siblingOrders: number[]): number | null {
  const unique = [...new Set(siblingOrders)].sort((a, b) => a - b);
  if (unique.length === 0) return null;
  if (unique.length === 1) return 0.5;
  const index = unique.indexOf(sortOrder);
  if (index < 0) return null;
  return index / (unique.length - 1);
}

function altsFromInvestigation(investigation: SteamInvestigation | null): ProfilingAltLink[] {
  if (!investigation) return [];
  const self = new Set(
    [investigation.steamId, investigation.steam64].filter((id): id is string => Boolean(id)),
  );
  const seen = new Set<string>();
  const alts: ProfilingAltLink[] = [];

  const push = (
    steamId: string,
    steam64: string | null,
    name: string | null,
    label: 'Likely' | 'Linked',
  ) => {
    const id = steam64 ?? steamId;
    if (!id || self.has(id) || self.has(steamId) || seen.has(id)) return;
    seen.add(id);
    alts.push({ steamId, steam64, name, label });
  };

  for (const link of investigation.linkedAlts) {
    push(link.steamId, link.steam64, null, 'Linked');
  }
  if (investigation.linkedMain) {
    push(investigation.linkedMain.steamId, investigation.linkedMain.steam64, null, 'Linked');
  }
  for (const candidate of investigation.candidates) {
    if (candidate.label !== 'Likely') continue;
    push(candidate.steamId, candidate.steam64, candidate.knownNames[0] ?? null, 'Likely');
  }
  return alts;
}

async function loadSiteHistory(steamId: string): Promise<{
  discordLinked: boolean;
  banStatus: ProfilingBanStatus;
  mgeTenureSeasons: number;
  pastDivisionSkill: number | null;
  pastDivisionName: string | null;
}> {
  const [user, roster] = await Promise.all([
    prisma.user.findUnique({
      where: { steamId },
      select: {
        banStatus: true,
        discord: { select: { discordId: true } },
      },
    }),
    prisma.playerInTeam.findMany({
      where: { playerSteamId: steamId },
      select: {
        team: {
          select: {
            seasonId: true,
            season: { select: { seasonNum: true } },
            division: {
              select: {
                name: true,
                sortOrder: true,
                regionId: true,
                formatId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const seasonIds = new Set(
    roster.map((row) => row.team.seasonId).filter((id): id is number => id != null),
  );
  const withDivision = roster
    .filter((row) => row.team.division && row.team.season)
    .sort((a, b) => (b.team.season?.seasonNum ?? 0) - (a.team.season?.seasonNum ?? 0));
  const latest = withDivision[0]?.team.division ?? null;

  let pastSkill: number | null = null;
  let pastName: string | null = null;
  if (latest) {
    const siblings = await prisma.division.findMany({
      where: { regionId: latest.regionId, formatId: latest.formatId },
      select: { sortOrder: true },
    });
    pastSkill = pastDivisionSkill(
      latest.sortOrder,
      siblings.map((division) => division.sortOrder),
    );
    pastName = latest.name;
  }

  return {
    discordLinked: Boolean(user?.discord),
    banStatus: (user?.banStatus ?? 'NONE') as ProfilingBanStatus,
    mgeTenureSeasons: seasonIds.size,
    pastDivisionSkill: pastSkill,
    pastDivisionName: pastName,
  };
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

async function gatherRaw(
  steamId: string,
  investigation: SteamInvestigation | null,
): Promise<ProfilingRawSignals> {
  const raw = emptyProfilingRaw();
  const [steam, ratings, classelo, logsCount, history] = await Promise.all([
    fetchSteamAccountSignals(steamId),
    withTimeout(getPlayerRatings(steamId), 5000, []),
    withTimeout(getPlayerClasselo(steamId), 5000, []),
    fetchLogsTfRecentCount(steamId),
    loadSiteHistory(steamId),
  ]);

  const bestElo = pickBestRating(ratings);
  const bestClass = pickBestRating(classelo);
  const alts = altsFromInvestigation(investigation);

  raw.steamAgeYears = steam.steamAgeYears;
  raw.tf2Hours = steam.tf2Hours;
  raw.profilePublic = steam.profilePublic;
  raw.discordLinked = history.discordLinked;
  raw.mgeTenureSeasons = history.mgeTenureSeasons;
  raw.altLikelyCount = alts.filter((alt) => alt.label === 'Likely').length;
  raw.altLinkedCount = alts.filter((alt) => alt.label === 'Linked').length;
  raw.banStatus = history.banStatus;
  raw.mgeElo = bestElo?.elo ?? null;
  raw.mgeEloRd = bestElo?.rd ?? null;
  raw.mgeEloProvisional = bestElo?.provisional ?? null;
  raw.mgeClasselo = bestClass?.elo ?? null;
  raw.mgeClasseloRd = bestClass?.rd ?? null;
  raw.mgeClasseloProvisional = bestClass?.provisional ?? null;
  raw.pastDivisionSkill = history.pastDivisionSkill;
  raw.pastDivisionName = history.pastDivisionName;
  raw.logsTfRecentCount = logsCount;
  raw.mgeServerHours =
    investigation && Number.isFinite(investigation.totalSeconds)
      ? investigation.totalSeconds / 3600
      : null;

  return raw;
}

export async function getPlayerProfiling(
  steamId: string,
  options: { investigation?: SteamInvestigation | null } = {},
): Promise<ProfilingScores | null> {
  const resolved = isSteamId64(steamId) ? steamId : steamId64FromAnyFormat(steamId);
  if (!resolved) return null;

  const settings = await getProfilingSettings();
  const key = cacheKey(resolved, settings.updatedAt);
  if (!options.investigation) {
    const cached = profileCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.scores;
  }

  const investigation = await loadInvestigation(resolved, options.investigation);
  const raw = await gatherRaw(resolved, investigation);
  const scores = scoreProfile(raw, settings.weights, {
    alts: altsFromInvestigation(investigation),
    settingsUpdatedAt: settings.updatedAt,
  });

  profileCache.set(key, { expires: Date.now() + CACHE_TTL_MS, scores });
  return scores;
}
