import type {
  ProfilingFieldMeta,
  ProfilingRawSignals,
  ProfilingScores,
  ProfileSignal,
  ProfilingSignalId,
  ProfilingWeights,
} from '$lib/types/profiling';

export const DEFAULT_PROFILING_WEIGHTS: ProfilingWeights = {
  trust: {
    steamAgeYears: 1.2,
    tf2Hours: 1,
    profilePublic: 0.6,
    discordLinked: 0.5,
    mgeTenureSeasons: 0.8,
    altPenalty: 1.5,
    banPenalty: 1.2,
  },
  skill: {
    mgeElo: 1.5,
    mgeClasselo: 1.2,
    pastDivision: 1,
    logsTfVolume: 0.4,
    tf2Hours: 0.3,
    mgeServerHours: 0.3,
  },
  thresholds: {
    steamAgeYearsFull: 5,
    tf2HoursFull: 2000,
    mgeTenureSeasonsFull: 4,
    eloLow: 800,
    eloHigh: 2200,
    rdFullPenalty: 200,
    provisionalFactor: 0.6,
    altLikelyPenalty: 0.45,
    altLinkedPenalty: 0.75,
    banWarningPenalty: 0.2,
    banSuspendedPenalty: 0.55,
    banBannedPenalty: 0.9,
    logsTfVolumeFull: 80,
    mgeServerHoursFull: 50,
    logsFewThreshold: 10,
    uncertaintyMissingSteam: 0.25,
    uncertaintyNoMgeRating: 0.35,
    uncertaintyProvisional: 0.2,
    uncertaintyFewLogs: 0.1,
    uncertaintyNoPastSeasons: 0.15,
  },
};

export const PROFILING_FIELDS: ProfilingFieldMeta[] = [
  {
    path: 'trust.steamAgeYears',
    label: 'Steam account age',
    hint: 'Weight of account age toward trust.',
    group: 'Trust weights',
  },
  {
    path: 'trust.tf2Hours',
    label: 'TF2 hours',
    hint: 'Weight of TF2 playtime toward trust.',
    group: 'Trust weights',
  },
  {
    path: 'trust.profilePublic',
    label: 'Public Steam profile',
    hint: 'Weight of a public vs private profile.',
    group: 'Trust weights',
  },
  {
    path: 'trust.discordLinked',
    label: 'Discord linked',
    hint: 'Weight of a linked Discord account.',
    group: 'Trust weights',
  },
  {
    path: 'trust.mgeTenureSeasons',
    label: 'MGE seasons played',
    hint: 'Weight of how many mge.tf seasons this account has entered.',
    group: 'Trust weights',
  },
  {
    path: 'trust.altPenalty',
    label: 'Alt cluster',
    hint: 'Weight of the clean-account signal. Higher means alts hurt trust more.',
    group: 'Trust weights',
  },
  {
    path: 'trust.banPenalty',
    label: 'Site ban record',
    hint: 'Weight of a clean vs punished site record.',
    group: 'Trust weights',
  },
  {
    path: 'skill.mgeElo',
    label: 'MGE ELO',
    hint: 'Weight of regional MGE rating toward skill evidence.',
    group: 'Skill weights',
  },
  {
    path: 'skill.mgeClasselo',
    label: 'MGE class ELO',
    hint: 'Weight of peak class rating toward skill evidence.',
    group: 'Skill weights',
  },
  {
    path: 'skill.pastDivision',
    label: 'Past mge.tf division',
    hint: 'Weight of the most recent league division as historical fact, not a recommendation.',
    group: 'Skill weights',
  },
  {
    path: 'skill.logsTfVolume',
    label: 'logs.tf volume',
    hint: 'Weight of recent logs.tf activity.',
    group: 'Skill weights',
  },
  {
    path: 'skill.tf2Hours',
    label: 'TF2 hours',
    hint: 'Low-weight activity signal, not fine skill.',
    group: 'Skill weights',
  },
  {
    path: 'skill.mgeServerHours',
    label: 'MGE server hours',
    hint: 'Low-weight presence on MGE servers.',
    group: 'Skill weights',
  },
  {
    path: 'thresholds.steamAgeYearsFull',
    label: 'Steam age for full credit (years)',
    hint: 'Years of account age that map to 1.0.',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.tf2HoursFull',
    label: 'TF2 hours for full credit',
    hint: 'Hours that saturate the log scale.',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.mgeTenureSeasonsFull',
    label: 'Seasons for full tenure',
    hint: 'Season count that maps to 1.0 tenure.',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.eloLow',
    label: 'ELO floor',
    hint: 'Rating that maps to 0 skill evidence.',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.eloHigh',
    label: 'ELO ceiling',
    hint: 'Rating that maps to 1 skill evidence.',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.rdFullPenalty',
    label: 'RD full penalty',
    hint: 'Rating deviation that zeros the ELO contribution.',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.provisionalFactor',
    label: 'Provisional ELO factor',
    hint: 'Multiplier applied when the rating is still provisional (0–1).',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.altLikelyPenalty',
    label: 'Likely-alt penalty',
    hint: 'How much likely alts cut the clean-account signal (0–1).',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.altLinkedPenalty',
    label: 'Linked-alt penalty',
    hint: 'How much confirmed linked alts cut the clean-account signal (0–1).',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.banWarningPenalty',
    label: 'Warning penalty',
    hint: 'Cut to the clean-record signal for a site warning (0–1).',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.banSuspendedPenalty',
    label: 'Suspension penalty',
    hint: 'Cut to the clean-record signal for a suspension (0–1).',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.banBannedPenalty',
    label: 'Ban penalty',
    hint: 'Cut to the clean-record signal for a ban (0–1).',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.logsTfVolumeFull',
    label: 'logs.tf count for full credit',
    hint: 'Recent log count that saturates volume.',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.mgeServerHoursFull',
    label: 'MGE hours for full credit',
    hint: 'Server hours that saturate presence.',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.logsFewThreshold',
    label: 'Few-logs threshold',
    hint: 'At or below this log count, skill uncertainty increases.',
    group: 'Thresholds',
  },
  {
    path: 'thresholds.uncertaintyMissingSteam',
    label: 'Uncertainty: missing Steam',
    hint: 'Added to skill uncertainty when Steam data is missing (0–1).',
    group: 'Uncertainty',
  },
  {
    path: 'thresholds.uncertaintyNoMgeRating',
    label: 'Uncertainty: no MGE rating',
    hint: 'Added when there is no usable MGE ELO (0–1).',
    group: 'Uncertainty',
  },
  {
    path: 'thresholds.uncertaintyProvisional',
    label: 'Uncertainty: provisional rating',
    hint: 'Added when ELO is provisional or RD is high (0–1).',
    group: 'Uncertainty',
  },
  {
    path: 'thresholds.uncertaintyFewLogs',
    label: 'Uncertainty: few logs',
    hint: 'Added when logs.tf volume is at or below the few-logs threshold (0–1).',
    group: 'Uncertainty',
  },
  {
    path: 'thresholds.uncertaintyNoPastSeasons',
    label: 'Uncertainty: no past seasons',
    hint: 'Added when there is no historical mge.tf division (0–1).',
    group: 'Uncertainty',
  },
];

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function roundScore(value: number): number {
  return Math.round(clamp01(value) * 1000) / 1000;
}

/** Skill discounted by how thin the evidence is. Stays on the same 0–1 scale. */
export function evidenceScore(skill: number, uncertainty: number): number {
  return roundScore(clamp01(skill) * (1 - clamp01(uncertainty)));
}

export function formatProfilingPercent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

export function formatProfilingRaw(raw: ProfileSignal['raw']): string {
  if (raw == null) return '—';
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'number') {
    if (Number.isInteger(raw)) return String(raw);
    return (Math.round(raw * 100) / 100).toString();
  }
  return String(raw);
}

export function groupedProfilingFields(): { group: string; fields: ProfilingFieldMeta[] }[] {
  const groups: { group: string; fields: ProfilingFieldMeta[] }[] = [];
  for (const field of PROFILING_FIELDS) {
    const last = groups[groups.length - 1];
    if (last?.group === field.group) last.fields.push(field);
    else groups.push({ group: field.group, fields: [field] });
  }
  return groups;
}

export function weightsFromFlatRecord(flat: Record<string, number>): {
  trust: Record<string, number>;
  skill: Record<string, number>;
  thresholds: Record<string, number>;
} {
  const nested = {
    trust: {} as Record<string, number>,
    skill: {} as Record<string, number>,
    thresholds: {} as Record<string, number>,
  };
  for (const [path, value] of Object.entries(flat)) {
    const [group, key] = path.split('.');
    if ((group !== 'trust' && group !== 'skill' && group !== 'thresholds') || !key) continue;
    nested[group][key] = value;
  }
  return nested;
}

export function linear01(value: number, full: number): number {
  if (!(full > 0)) return 0;
  return clamp01(value / full);
}

export function log01(value: number, full: number): number {
  if (!(full > 0) || value <= 0) return 0;
  return clamp01(Math.log1p(value) / Math.log1p(full));
}

function mergeGroup<T extends Record<string, number>>(base: T, overlay: unknown): T {
  const next = { ...base };
  if (!overlay || typeof overlay !== 'object') return next;
  for (const key of Object.keys(base) as (keyof T)[]) {
    const value = (overlay as Record<string, unknown>)[String(key)];
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = value as T[keyof T];
    }
  }
  return next;
}

export function mergeProfilingWeights(
  saved: unknown,
  defaults: ProfilingWeights = DEFAULT_PROFILING_WEIGHTS,
): ProfilingWeights {
  if (!saved || typeof saved !== 'object') {
    return {
      trust: { ...defaults.trust },
      skill: { ...defaults.skill },
      thresholds: { ...defaults.thresholds },
    };
  }
  const record = saved as Record<string, unknown>;
  return {
    trust: mergeGroup(defaults.trust, record.trust),
    skill: mergeGroup(defaults.skill, record.skill),
    thresholds: mergeGroup(defaults.thresholds, record.thresholds),
  };
}

export function getProfilingWeightValue(weights: ProfilingWeights, path: string): number {
  const [group, key] = path.split('.');
  const bucket = (weights as Record<string, Record<string, number>>)[group];
  return bucket?.[key] ?? 0;
}

/** Fields whose stored number actually changed, keyed by dotted path. */
export function profilingWeightChanges(
  before: ProfilingWeights,
  after: ProfilingWeights,
): Record<string, { from: number; to: number }> {
  const changes: Record<string, { from: number; to: number }> = {};
  for (const field of PROFILING_FIELDS) {
    const from = getProfilingWeightValue(before, field.path);
    const to = getProfilingWeightValue(after, field.path);
    if (Math.abs(from - to) > 1e-9) changes[field.path] = { from, to };
  }
  return changes;
}

function ratingEvidence(
  elo: number | null,
  rd: number | null,
  provisional: boolean | null,
  weights: ProfilingWeights,
): number | null {
  if (elo == null) return null;
  const span = weights.thresholds.eloHigh - weights.thresholds.eloLow;
  const base = linear01(elo - weights.thresholds.eloLow, span);
  const rdCut = rd == null ? 1 : 1 - linear01(rd, Math.max(weights.thresholds.rdFullPenalty, 1));
  const provisionalCut = provisional ? clamp01(weights.thresholds.provisionalFactor) : 1;
  return clamp01(base * rdCut * provisionalCut);
}

type PreparedSignal = {
  id: ProfilingSignalId;
  axis: ProfileSignal['axis'];
  label: string;
  raw: ProfileSignal['raw'];
  normalized: number | null;
  weight: number;
  note: string | null;
};

function prepareSignals(raw: ProfilingRawSignals, weights: ProfilingWeights): PreparedSignal[] {
  const t = weights.thresholds;
  const altPenalty = Math.max(
    raw.altLinkedCount > 0 ? t.altLinkedPenalty : 0,
    raw.altLikelyCount > 0 ? t.altLikelyPenalty : 0,
  );
  const altNote =
    raw.altLinkedCount > 0
      ? `${raw.altLinkedCount} linked alt${raw.altLinkedCount === 1 ? '' : 's'}`
      : raw.altLikelyCount > 0
        ? `${raw.altLikelyCount} likely alt${raw.altLikelyCount === 1 ? '' : 's'}`
        : null;

  let banNormalized: number | null = null;
  let banNote: string | null = null;
  if (raw.banStatus === 'NONE') banNormalized = 1;
  else if (raw.banStatus === 'WARNING') {
    banNormalized = 1 - clamp01(t.banWarningPenalty);
    banNote = 'Site warning';
  } else if (raw.banStatus === 'SUSPENDED') {
    banNormalized = 1 - clamp01(t.banSuspendedPenalty);
    banNote = 'Suspended';
  } else if (raw.banStatus === 'BANNED') {
    banNormalized = 1 - clamp01(t.banBannedPenalty);
    banNote = 'Banned';
  }

  return [
    {
      id: 'steamAgeYears',
      axis: 'trust',
      label: 'Steam account age',
      raw: raw.steamAgeYears,
      normalized:
        raw.steamAgeYears == null ? null : linear01(raw.steamAgeYears, t.steamAgeYearsFull),
      weight: weights.trust.steamAgeYears,
      note: raw.steamAgeYears == null ? 'Steam age unavailable' : null,
    },
    {
      id: 'tf2Hours',
      axis: 'trust',
      label: 'TF2 hours (trust)',
      raw: raw.tf2Hours,
      normalized: raw.tf2Hours == null ? null : log01(raw.tf2Hours, t.tf2HoursFull),
      weight: weights.trust.tf2Hours,
      note: raw.tf2Hours == null ? 'TF2 hours unavailable' : null,
    },
    {
      id: 'profilePublic',
      axis: 'trust',
      label: 'Public Steam profile',
      raw: raw.profilePublic,
      normalized: raw.profilePublic == null ? null : raw.profilePublic ? 1 : 0,
      weight: weights.trust.profilePublic,
      note: raw.profilePublic === false ? 'Private Steam profile' : null,
    },
    {
      id: 'discordLinked',
      axis: 'trust',
      label: 'Discord linked',
      raw: raw.discordLinked,
      normalized: raw.discordLinked == null ? null : raw.discordLinked ? 1 : 0,
      weight: weights.trust.discordLinked,
      note: raw.discordLinked === false ? 'Discord not linked' : null,
    },
    {
      id: 'mgeTenureSeasons',
      axis: 'trust',
      label: 'MGE seasons played',
      raw: raw.mgeTenureSeasons,
      normalized:
        raw.mgeTenureSeasons == null
          ? null
          : linear01(raw.mgeTenureSeasons, t.mgeTenureSeasonsFull),
      weight: weights.trust.mgeTenureSeasons,
      note: raw.mgeTenureSeasons === 0 ? 'No mge.tf seasons' : null,
    },
    {
      id: 'altPenalty',
      axis: 'trust',
      label: 'Alt cluster',
      raw: raw.altLinkedCount + raw.altLikelyCount,
      normalized: 1 - clamp01(altPenalty),
      weight: weights.trust.altPenalty,
      note: altNote,
    },
    {
      id: 'banPenalty',
      axis: 'trust',
      label: 'Site ban record',
      raw: raw.banStatus,
      normalized: banNormalized,
      weight: weights.trust.banPenalty,
      note: banNote ?? (raw.banStatus == null ? 'Ban status unknown' : null),
    },
    {
      id: 'mgeElo',
      axis: 'skill',
      label: 'MGE ELO',
      raw: raw.mgeElo,
      normalized: ratingEvidence(raw.mgeElo, raw.mgeEloRd, raw.mgeEloProvisional, weights),
      weight: weights.skill.mgeElo,
      note:
        raw.mgeElo == null ? 'No MGE rating' : raw.mgeEloProvisional ? 'Provisional rating' : null,
    },
    {
      id: 'mgeClasselo',
      axis: 'skill',
      label: 'MGE class ELO',
      raw: raw.mgeClasselo,
      normalized: ratingEvidence(
        raw.mgeClasselo,
        raw.mgeClasseloRd,
        raw.mgeClasseloProvisional,
        weights,
      ),
      weight: weights.skill.mgeClasselo,
      note: raw.mgeClasselo == null ? 'No class rating' : null,
    },
    {
      id: 'pastDivision',
      axis: 'skill',
      label: 'Past mge.tf division',
      raw: raw.pastDivisionName,
      normalized: raw.pastDivisionSkill,
      weight: weights.skill.pastDivision,
      note:
        raw.pastDivisionSkill == null
          ? 'No past division'
          : 'Historical placement, not a recommendation',
    },
    {
      id: 'logsTfVolume',
      axis: 'skill',
      label: 'logs.tf volume',
      raw: raw.logsTfRecentCount,
      normalized:
        raw.logsTfRecentCount == null ? null : log01(raw.logsTfRecentCount, t.logsTfVolumeFull),
      weight: weights.skill.logsTfVolume,
      note: raw.logsTfRecentCount == null ? 'logs.tf unavailable' : null,
    },
    {
      id: 'tf2Hours',
      axis: 'skill',
      label: 'TF2 hours (skill)',
      raw: raw.tf2Hours,
      normalized: raw.tf2Hours == null ? null : log01(raw.tf2Hours, t.tf2HoursFull),
      weight: weights.skill.tf2Hours,
      note: raw.tf2Hours == null ? 'TF2 hours unavailable' : 'Activity, not fine skill',
    },
    {
      id: 'mgeServerHours',
      axis: 'skill',
      label: 'MGE server hours',
      raw: raw.mgeServerHours,
      normalized:
        raw.mgeServerHours == null ? null : log01(raw.mgeServerHours, t.mgeServerHoursFull),
      weight: weights.skill.mgeServerHours,
      note: raw.mgeServerHours == null ? 'Server hours unavailable' : 'Activity, not fine skill',
    },
  ];
}

function scoreAxis(
  prepared: PreparedSignal[],
  axis: ProfileSignal['axis'],
): {
  score: number;
  signals: ProfileSignal[];
} {
  const rows = prepared.filter((signal) => signal.axis === axis);
  const present = rows.filter((signal) => signal.normalized != null && signal.weight > 0);
  const weightSum = present.reduce((sum, signal) => sum + signal.weight, 0);
  const signals: ProfileSignal[] = rows.map((signal) => {
    const normalized = signal.normalized;
    const missing = normalized == null;
    const contribution = missing || weightSum <= 0 ? 0 : (normalized * signal.weight) / weightSum;
    return {
      id: signal.id,
      axis: signal.axis,
      label: signal.label,
      raw: signal.raw,
      normalized: normalized == null ? null : roundScore(normalized),
      weight: signal.weight,
      contribution: roundScore(contribution),
      missing,
      note: signal.note,
    };
  });

  if (axis === 'skill' && present.length === 0) {
    return { score: 0, signals };
  }

  const score = signals.reduce((sum, signal) => sum + signal.contribution, 0);
  return { score: roundScore(score), signals };
}

export function scoreProfile(
  raw: ProfilingRawSignals,
  weights: ProfilingWeights,
  options: { alts?: ProfilingScores['alts']; settingsUpdatedAt?: string | null } = {},
): ProfilingScores {
  const prepared = prepareSignals(raw, weights);
  const trust = scoreAxis(prepared, 'trust');
  const skill = scoreAxis(prepared, 'skill');
  const t = weights.thresholds;

  let uncertainty = 0;
  if (raw.steamAgeYears == null && raw.profilePublic == null && raw.tf2Hours == null) {
    uncertainty += t.uncertaintyMissingSteam;
  }
  if (raw.mgeElo == null && raw.mgeClasselo == null) {
    uncertainty += t.uncertaintyNoMgeRating;
  }
  const provisional =
    raw.mgeEloProvisional === true ||
    raw.mgeClasseloProvisional === true ||
    (raw.mgeEloRd != null && raw.mgeEloRd >= t.rdFullPenalty * 0.5);
  if (provisional) uncertainty += t.uncertaintyProvisional;
  if (raw.logsTfRecentCount != null && raw.logsTfRecentCount <= t.logsFewThreshold) {
    uncertainty += t.uncertaintyFewLogs;
  }
  if (raw.pastDivisionSkill == null) uncertainty += t.uncertaintyNoPastSeasons;

  const skillUncertainty = roundScore(uncertainty);
  return {
    trust: trust.score,
    skill: skill.score,
    skillUncertainty,
    evidence: evidenceScore(skill.score, skillUncertainty),
    signals: [...trust.signals, ...skill.signals],
    alts: options.alts ?? [],
    settingsUpdatedAt: options.settingsUpdatedAt ?? null,
  };
}

export function emptyProfilingRaw(): ProfilingRawSignals {
  return {
    steamAgeYears: null,
    tf2Hours: null,
    profilePublic: null,
    discordLinked: null,
    mgeTenureSeasons: null,
    altLikelyCount: 0,
    altLinkedCount: 0,
    banStatus: null,
    mgeElo: null,
    mgeEloRd: null,
    mgeEloProvisional: null,
    mgeClasselo: null,
    mgeClasseloRd: null,
    mgeClasseloProvisional: null,
    pastDivisionSkill: null,
    pastDivisionName: null,
    logsTfRecentCount: null,
    mgeServerHours: null,
  };
}
