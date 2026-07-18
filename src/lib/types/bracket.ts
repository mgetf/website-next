/**
 * Bracket Rendering Types
 *
 * Presentation-layer types consumed by bracket components. These types are
 * client-safe and framework-agnostic — no Prisma, no server imports.
 *
 * Two service-layer mappers translate from actual data sources into these types:
 * - Event mapper: EventMatch + EventMatchPlayer → BracketData
 * - League playoff mapper: league Match + Team → BracketData
 */

export type BracketFormat = 'single_elim' | 'double_elim' | 'round_robin' | 'card';

export type BracketStatus = 'upcoming' | 'in_progress' | 'completed';

export type MatchStatus = 'upcoming' | 'live' | 'completed';

/**
 * An individual player within a side. Optional — legacy events may not have
 * per-player data, only a side label.
 */
export interface BracketPlayer {
  name: string;
  steamId?: string;
  avatarUrl?: string;
  href?: string;
}

/**
 * One side of a match (one participant or team).
 *
 * players array length determines format at render time:
 * - 0 entries: legacy event, show label only
 * - 1 entry: 1v1, show player name and avatar
 * - 2 entries: 2v2, show both player names and avatars within the side
 */
export interface BracketSide {
  label: string;
  players?: BracketPlayer[];
  score?: number;
  isWinner?: boolean;
  seed?: number;
  href?: string;
}

/**
 * A single game within a BoX series.
 */
export interface BracketGame {
  gameNumber: number;
  side1Score: number;
  side2Score: number;
  arena?: string;
}

/**
 * A single match within a bracket round.
 *
 * id is string | number to accommodate both database IDs and fixture string keys.
 * position is 1-based within the round and determines connector line pairing —
 * odd + even positions connect to the same parent in the next round. Rounds are
 * pre-ordered server-side using explicit progression edges (winnerNextMatchId)
 * when available, so position parity reliably reflects sibling pairs.
 *
 * winnerNextMatchId / loserNextMatchId are the stable topology edges used by
 * connector rendering instead of inferring advancement from participant labels.
 */
export interface BracketMatch {
  id: number | string;
  round: number;
  position: number;
  side1: BracketSide;
  side2: BracketSide;
  bestOf?: number;
  status: MatchStatus;
  isBye: boolean;
  label?: string;
  games?: BracketGame[];
  href?: string;
  winnerNextMatchId?: number | string;
  loserNextMatchId?: number | string;
}

/**
 * A round within a bracket. For double elimination, a single BracketData
 * contains separate round sequences for the winners and losers brackets —
 * see BracketData.loserRounds.
 */
export interface BracketRound {
  number: number;
  label: string;
  matches: BracketMatch[];
}

interface BracketDataBase {
  status: BracketStatus;
  title?: string;
}

/**
 * Single or double elimination bracket data.
 *
 * For double elimination:
 * - rounds contains the winners bracket rounds
 * - loserRounds contains the losers bracket rounds
 * - grandFinal contains the grand final match(es) as a single round
 */
export interface EliminationBracketData extends BracketDataBase {
  format: 'single_elim' | 'double_elim';
  rounds: BracketRound[];
  loserRounds?: BracketRound[];
  grandFinal?: BracketRound;
}

/** A flat, ordered list of matchups (fight nights, qualifiers without round structure). */
export interface CardBracketData extends BracketDataBase {
  format: 'card';
  rounds: BracketRound[];
}

/** A single participant's aggregate record within a round-robin group. */
export interface RoundRobinStanding {
  steamId?: string;
  label: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
  isEliminated?: boolean;
}

export interface RoundRobinBracketData extends BracketDataBase {
  format: 'round_robin';
  standings: RoundRobinStanding[];
  rounds: BracketRound[];
}

export type BracketData = EliminationBracketData | CardBracketData | RoundRobinBracketData;
