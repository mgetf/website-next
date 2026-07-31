import { notFound, badRequest, internalError } from '$lib/server/utils/errors';
export interface CreatePlayoffParams {
  seasonId: number;
  numRounds?: number;
  doubleElim?: number;
  isTournament: boolean;
}

export interface UpdatePlayoffParams {
  numRounds?: number;
  doubleElim?: number;
  isTournament?: boolean;
}

/**
 * Get playoff configuration for a specific season
 */
/** Soft playoff config under Rama (no PlayoffsModule yet). id === seasonId. */
async function syntheticPlayoffForSeason(seasonId: number) {
  const { getSeasonById } = await import('$lib/server/services/seasons');
  const season = await getSeasonById(seasonId);
  if (!season) return null;
  return {
    id: seasonId,
    seasonId,
    // Single upper round → one matchup in admin create preview (2^(rounds-round)=1).
    numRounds: 1,
    doubleElim: 0,
    isTournament: false,
    season: {
      ...season,
      region: season.region ?? {
        id: season.regionId,
        name: String(season.regionId),
        hidden: 0,
        currencySymbol: '',
        currencyCode: '',
      },
    },
  };
}

export type PlayoffRecord = {
  id: number;
  seasonId: number;
  numRounds: number;
  doubleElim: number;
  isTournament: boolean;
};

export async function getPlayoffBySeason(seasonId: number): Promise<PlayoffRecord | null> {
  return syntheticPlayoffForSeason(seasonId);
}

/**
 * Get all playoffs with season information
 */
export async function getAllPlayoffs(): Promise<PlayoffRecord[]> {
  const { getSeasons } = await import('$lib/server/services/seasons');
  const seasons = await getSeasons();
  const rows: PlayoffRecord[] = [];
  for (const season of seasons) {
    const playoff = await syntheticPlayoffForSeason(season.id);
    if (playoff) {
      rows.push({
        id: playoff.id,
        seasonId: playoff.seasonId,
        numRounds: playoff.numRounds,
        doubleElim: playoff.doubleElim,
        isTournament: playoff.isTournament,
      });
    }
  }
  return rows;
}

/**
 * Create a new playoff configuration
 */
export async function createPlayoff(params: CreatePlayoffParams) {
  throw new Error('createPlayoff is not available under Rama');
}

/**
 * Update an existing playoff configuration
 */
/** @lintignore Soft-stub / cutover API surface */
export async function updatePlayoff(playoffId: number, params: UpdatePlayoffParams) {
  throw new Error('updatePlayoff is not available under Rama');
}

/**
 * Update playoff by season ID
 */
export async function updatePlayoffBySeason(seasonId: number, params: UpdatePlayoffParams) {
  throw new Error('updatePlayoffBySeason is not available under Rama');
}
