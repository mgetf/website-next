import type {
  ProfilingClassScore,
  ProfilingRegionScore,
  ProfilingSnapshot,
} from '$lib/types/profiling';

export const PROFILING_MISSING = '—';

export function emptyProfilingSnapshot(): ProfilingSnapshot {
  return {
    steamAgeYears: null,
    steamCreatedAt: null,
    steamLevel: null,
    gameCount: null,
    tf2Hours: null,
    profilePublic: null,
    scores: [],
    classScores: [],
    logsTfCount: null,
    mgeServerHours: null,
    cachedAt: null,
  };
}

export function highestRegionScore(scores: ProfilingRegionScore[]): ProfilingRegionScore | null {
  return scores.slice().sort((a, b) => b.score - a.score)[0] ?? null;
}

export function highestClassScore(scores: ProfilingClassScore[]): ProfilingClassScore | null {
  return scores.slice().sort((a, b) => b.score - a.score)[0] ?? null;
}

export function formatProfilingCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return PROFILING_MISSING;
  return Math.round(value).toLocaleString('en-US');
}

export function formatProfilingHours(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return PROFILING_MISSING;
  if (hours < 10) {
    return hours.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  }
  return Math.round(hours).toLocaleString('en-US');
}

export function formatSteamAgeYears(years: number | null | undefined): string {
  if (years == null || !Number.isFinite(years)) return PROFILING_MISSING;
  if (years < 1) return `${Math.max(1, Math.round(years * 12))} mo`;
  return `${years.toFixed(years >= 10 ? 0 : 1)}y`;
}

export function formatSteamCreatedAt(iso: string | null | undefined): string {
  if (!iso) return PROFILING_MISSING;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return PROFILING_MISSING;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function formatProfilingScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return PROFILING_MISSING;
  return String(Math.round(score));
}

export const PROFILING_CARD_LOGOS = {
  tf2: '/tf2_logo.webp',
  steam: '/steam_logo.png',
  logs: '/logstf_logo.png',
  mge: '/mge_transparent_logo.png',
} as const;

export type ProfilingCardChip = {
  key: 'tf2' | 'steam' | 'mge' | 'score' | 'logs';
  label: string;
  value: string;
  logo: string | null;
  invert: boolean;
};

function cardHours(hours: number): string {
  if (hours < 10) {
    return `${hours.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}h`;
  }
  return `${Math.round(hours)}h`;
}

export function profilingCardChips(snapshot: ProfilingSnapshot): ProfilingCardChip[] {
  const chips: ProfilingCardChip[] = [];

  const tf2Hours = snapshot.tf2Hours;
  const hasTf2Hours = tf2Hours != null && Number.isFinite(tf2Hours) && tf2Hours > 0;
  chips.push({
    key: 'tf2',
    label: hasTf2Hours ? 'TF2 hours' : 'TF2 hours unknown',
    value: hasTf2Hours ? cardHours(tf2Hours) : '?',
    logo: PROFILING_CARD_LOGOS.tf2,
    invert: false,
  });

  if (snapshot.steamAgeYears != null && Number.isFinite(snapshot.steamAgeYears)) {
    chips.push({
      key: 'steam',
      label: snapshot.profilePublic === false ? 'Steam age · private' : 'Steam age',
      value: formatSteamAgeYears(snapshot.steamAgeYears),
      logo: PROFILING_CARD_LOGOS.steam,
      invert: true,
    });
  }

  const mgeHours =
    snapshot.mgeServerHours != null && Number.isFinite(snapshot.mgeServerHours)
      ? snapshot.mgeServerHours
      : 0;
  chips.push({
    key: 'mge',
    label: 'Hours on mge.tf',
    value: cardHours(mgeHours),
    logo: PROFILING_CARD_LOGOS.mge,
    invert: false,
  });

  const best = highestRegionScore(snapshot.scores);
  if (best) {
    chips.push({
      key: 'score',
      label: `Score ${best.region.toUpperCase()}`,
      value: formatProfilingScore(best.score),
      logo: null,
      invert: false,
    });
  }

  if (snapshot.logsTfCount != null && Number.isFinite(snapshot.logsTfCount)) {
    chips.push({
      key: 'logs',
      label: 'logs.tf',
      value: String(Math.round(snapshot.logsTfCount)),
      logo: PROFILING_CARD_LOGOS.logs,
      invert: false,
    });
  }

  return chips;
}

export function headlineScore(snapshot: ProfilingSnapshot): number | null {
  const best = highestRegionScore(snapshot.scores)?.score ?? null;
  const bestClass = highestClassScore(snapshot.classScores)?.score ?? null;
  if (best == null) return bestClass;
  if (bestClass == null) return best;
  return Math.max(best, bestClass);
}

export function remainingScoreLabels(snapshot: ProfilingSnapshot): string[] {
  const best = highestRegionScore(snapshot.scores);
  const bestClass = highestClassScore(snapshot.classScores);
  const regionLabels = snapshot.scores
    .filter((row) => row !== best)
    .sort((a, b) => b.score - a.score)
    .map((row) => `${row.region.toUpperCase()} ${formatProfilingScore(row.score)}`);
  const classLabels = snapshot.classScores
    .filter((row) => row !== bestClass)
    .sort((a, b) => b.score - a.score)
    .map((row) => `${row.className} ${formatProfilingScore(row.score)}`);
  const headline: string[] = [];
  if (best) headline.push(`${best.region.toUpperCase()} ${formatProfilingScore(best.score)}`);
  if (bestClass) {
    headline.push(`${bestClass.className} ${formatProfilingScore(bestClass.score)}`);
  }
  return [...headline, ...regionLabels, ...classLabels];
}

function asFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

function parseRegionScores(value: unknown): ProfilingRegionScore[] {
  if (!Array.isArray(value)) return [];
  const rows: ProfilingRegionScore[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const region = asString((item as { region?: unknown }).region);
    const score = asFiniteNumber((item as { score?: unknown }).score);
    if (!region || score == null) continue;
    rows.push({ region, score });
  }
  return rows;
}

function parseClassScores(value: unknown): ProfilingClassScore[] {
  if (!Array.isArray(value)) return [];
  const rows: ProfilingClassScore[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const classId = asFiniteNumber((item as { classId?: unknown }).classId);
    const className = asString((item as { className?: unknown }).className);
    const region = asString((item as { region?: unknown }).region);
    const score = asFiniteNumber((item as { score?: unknown }).score);
    if (classId == null || !className || !region || score == null) continue;
    rows.push({ classId, className, region, score });
  }
  return rows;
}

export function parseProfilingSnapshot(
  raw: unknown,
  cachedAt: string | null = null,
): ProfilingSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  return {
    steamAgeYears: asFiniteNumber(data.steamAgeYears),
    steamCreatedAt: asString(data.steamCreatedAt),
    steamLevel: asFiniteNumber(data.steamLevel),
    gameCount: asFiniteNumber(data.gameCount),
    tf2Hours: asFiniteNumber(data.tf2Hours),
    profilePublic: asBoolean(data.profilePublic),
    scores: parseRegionScores(data.scores),
    classScores: parseClassScores(data.classScores),
    logsTfCount: asFiniteNumber(data.logsTfCount),
    mgeServerHours: asFiniteNumber(data.mgeServerHours),
    cachedAt,
  };
}

export function profilingSnapshotFacts(
  snapshot: ProfilingSnapshot,
): Omit<ProfilingSnapshot, 'cachedAt'> {
  const { cachedAt: _cachedAt, ...facts } = snapshot;
  return facts;
}
