export type ProfilingRegionScore = {
  region: string;
  score: number;
};

export type ProfilingClassScore = {
  classId: number;
  className: string;
  region: string;
  score: number;
};

export type ProfilingSnapshot = {
  steamAgeYears: number | null;
  steamCreatedAt: string | null;
  steamLevel: number | null;
  gameCount: number | null;
  tf2Hours: number | null;
  profilePublic: boolean | null;
  scores: ProfilingRegionScore[];
  classScores: ProfilingClassScore[];
  logsTfCount: number | null;
  mgeServerHours: number | null;
  /** ISO time this row was stored in our cache. Null only before the first save. */
  cachedAt: string | null;
};
