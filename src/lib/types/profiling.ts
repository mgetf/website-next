export type ProfilingSignalId =
  | 'steamAgeYears'
  | 'tf2Hours'
  | 'profilePublic'
  | 'discordLinked'
  | 'mgeTenureSeasons'
  | 'altPenalty'
  | 'banPenalty'
  | 'mgeElo'
  | 'mgeClasselo'
  | 'pastDivision'
  | 'logsTfVolume'
  | 'mgeServerHours';

export type ProfilingAxis = 'trust' | 'skill';

export type ProfilingBanStatus = 'NONE' | 'WARNING' | 'SUSPENDED' | 'BANNED';

export type ProfilingTrustWeights = {
  steamAgeYears: number;
  tf2Hours: number;
  profilePublic: number;
  discordLinked: number;
  mgeTenureSeasons: number;
  altPenalty: number;
  banPenalty: number;
};

export type ProfilingSkillWeights = {
  mgeElo: number;
  mgeClasselo: number;
  pastDivision: number;
  logsTfVolume: number;
  tf2Hours: number;
  mgeServerHours: number;
};

export type ProfilingThresholds = {
  steamAgeYearsFull: number;
  tf2HoursFull: number;
  mgeTenureSeasonsFull: number;
  eloLow: number;
  eloHigh: number;
  rdFullPenalty: number;
  provisionalFactor: number;
  altLikelyPenalty: number;
  altLinkedPenalty: number;
  banWarningPenalty: number;
  banSuspendedPenalty: number;
  banBannedPenalty: number;
  logsTfVolumeFull: number;
  mgeServerHoursFull: number;
  logsFewThreshold: number;
  uncertaintyMissingSteam: number;
  uncertaintyNoMgeRating: number;
  uncertaintyProvisional: number;
  uncertaintyFewLogs: number;
  uncertaintyNoPastSeasons: number;
};

export type ProfilingWeights = {
  trust: ProfilingTrustWeights;
  skill: ProfilingSkillWeights;
  thresholds: ProfilingThresholds;
};

export type ProfilingRawSignals = {
  steamAgeYears: number | null;
  tf2Hours: number | null;
  profilePublic: boolean | null;
  discordLinked: boolean | null;
  mgeTenureSeasons: number | null;
  altLikelyCount: number;
  altLinkedCount: number;
  banStatus: ProfilingBanStatus | null;
  mgeElo: number | null;
  mgeEloRd: number | null;
  mgeEloProvisional: boolean | null;
  mgeClasselo: number | null;
  mgeClasseloRd: number | null;
  mgeClasseloProvisional: boolean | null;
  pastDivisionSkill: number | null;
  pastDivisionName: string | null;
  logsTfRecentCount: number | null;
  mgeServerHours: number | null;
};

export type ProfileSignal = {
  id: ProfilingSignalId;
  axis: ProfilingAxis;
  label: string;
  raw: string | number | boolean | null;
  normalized: number | null;
  weight: number;
  contribution: number;
  missing: boolean;
  note: string | null;
};

export type ProfilingAltLink = {
  steamId: string;
  steam64: string | null;
  name: string | null;
  label: 'Likely' | 'Linked';
};

export type ProfilingScores = {
  trust: number;
  skill: number;
  skillUncertainty: number;
  /** Skill discounted by uncertainty: skill × (1 − uncertainty). */
  evidence: number;
  signals: ProfileSignal[];
  alts: ProfilingAltLink[];
  settingsUpdatedAt: string | null;
};

export type ProfilingFieldPath =
  | `trust.${keyof ProfilingTrustWeights}`
  | `skill.${keyof ProfilingSkillWeights}`
  | `thresholds.${keyof ProfilingThresholds}`;

export type ProfilingFieldMeta = {
  path: ProfilingFieldPath;
  label: string;
  hint: string;
  group: string;
};
