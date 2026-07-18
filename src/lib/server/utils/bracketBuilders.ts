/**
 * Shared Bracket Builders
 *
 * Pure functions that turn a generic match list into presentation
 * `BracketData`. Both the public mapper (`$lib/server/services/events.ts`,
 * working from persisted `EventMatch` rows) and the admin editor's live
 * preview (`$lib/server/services/eventEditor.ts`, working from an in-memory
 * draft) funnel through the same code here so a stage renders identically
 * before and after publishing.
 */

import type {
  BracketData,
  BracketGame,
  BracketMatch,
  BracketPlayer,
  BracketRound,
  BracketSide,
  BracketStatus,
  MatchStatus,
  RoundRobinStanding,
} from '$lib/types/bracket';

export interface BracketPlayerInput {
  displayName: string;
  steamId?: string | null;
  side: number;
}

export interface BracketGameInput {
  gameNumber: number;
  side1Score: number | null;
  side2Score: number | null;
  arena?: { name: string } | null;
}

export interface BracketMatchInput {
  id: number | string;
  round: number | null;
  orderNum: number;
  label: string | null;
  winnerSide: number | null;
  side1Score: number | null;
  side2Score: number | null;
  boSeries: number;
  status: string;
  section?: string | null;
  winnerNextMatchId?: number | string | null;
  winnerNextSide?: number | null;
  loserNextMatchId?: number | string | null;
  players: BracketPlayerInput[];
  games?: BracketGameInput[];
}

export interface BracketStageInput {
  name: string;
  matches: BracketMatchInput[];
}

function mapMatchStatus(status: string): MatchStatus {
  if (status === 'PLAYED') return 'completed';
  return 'upcoming';
}

function matchSectionOf(m: BracketMatchInput): 'MAIN' | 'WINNERS' | 'LOSERS' | 'GRAND_FINAL' {
  if (m.section) return m.section as 'MAIN' | 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';
  if (m.round === 0 || m.round === null) return 'GRAND_FINAL';
  return m.round > 0 ? 'WINNERS' : 'LOSERS';
}

export function buildSingleElimBracket(
  stage: BracketStageInput,
  status: BracketStatus,
): BracketData {
  const roundGroups = groupMatchesByRound(
    stage.matches.filter((m) => m.round !== null && m.round > 0),
  );
  orderGroupsByProgression(roundGroups);
  const totalRounds = roundGroups.length;

  const rounds: BracketRound[] = roundGroups.map((group, idx) => ({
    number: group.roundNum,
    label: singleElimRoundLabel(idx, totalRounds),
    matches: group.matches.map((m, pos) => buildBracketMatch(m, pos + 1)),
  }));

  padRoundsWithByes(rounds);

  return { format: 'single_elim', status, rounds, title: stage.name };
}

export function buildDoubleElimBracket(
  stage: BracketStageInput,
  status: BracketStatus,
): BracketData {
  const winnersMatches = stage.matches.filter((m) => matchSectionOf(m) === 'WINNERS');
  const losersMatches = stage.matches.filter((m) => matchSectionOf(m) === 'LOSERS');
  const grandFinalMatches = stage.matches.filter((m) => matchSectionOf(m) === 'GRAND_FINAL');

  const winnersGroups = groupMatchesByRound(winnersMatches);
  const losersGroups = groupMatchesByRound(losersMatches, true);
  orderGroupsByProgression(winnersGroups);
  orderGroupsByProgression(losersGroups);

  const totalWinners = winnersGroups.length;
  const totalLosers = losersGroups.length;

  const rounds: BracketRound[] = winnersGroups.map((group, idx) => ({
    number: group.roundNum,
    label: winnersRoundLabel(idx, totalWinners),
    matches: group.matches.map((m, pos) => buildBracketMatch(m, pos + 1)),
  }));

  const loserRounds: BracketRound[] = losersGroups.map((group, idx) => ({
    number: group.roundNum,
    label: losersRoundLabel(idx, totalLosers),
    matches: group.matches.map((m, pos) => buildBracketMatch(m, pos + 1)),
  }));

  padRoundsWithByes(rounds);

  let grandFinal: BracketRound | undefined;
  if (grandFinalMatches.length > 0) {
    const sorted = [...grandFinalMatches].sort((a, b) => a.orderNum - b.orderNum);
    grandFinal = {
      number: 0,
      label: 'Grand Final',
      matches: sorted.map((m, pos) => buildBracketMatch(m, pos + 1)),
    };
  }

  return {
    format: 'double_elim',
    status,
    rounds,
    loserRounds: loserRounds.length > 0 ? loserRounds : undefined,
    grandFinal,
    title: stage.name,
  };
}

export function buildCardBracket(stage: BracketStageInput, status: BracketStatus): BracketData {
  const sorted = [...stage.matches].sort((a, b) => a.orderNum - b.orderNum);
  const matches: BracketMatch[] = sorted.map((m, pos) => buildBracketMatch(m, pos + 1));

  return {
    format: 'card',
    status,
    rounds: [{ number: 1, label: 'Card', matches }],
    title: stage.name,
  };
}

interface StandingAccumulator {
  key: string;
  steamId?: string;
  label: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  gamesWon: number;
  gamesLost: number;
}

function participantIdentity(players: BracketPlayerInput[]): {
  key: string;
  label: string;
  steamId?: string;
} {
  const real = players.filter((p) => p.displayName !== 'BYE');
  if (real.length === 0) return { key: 'unknown', label: 'TBD' };

  const key = [...real]
    .map((p) => p.steamId ?? p.displayName)
    .sort()
    .join('+');
  const label = real.map((p) => p.displayName).join(' & ');
  const steamId = real.length === 1 ? (real[0].steamId ?? undefined) : undefined;
  return { key, label, steamId };
}

export function buildRoundRobinBracket(
  stage: BracketStageInput,
  status: BracketStatus,
): BracketData {
  const standingsMap = new Map<string, StandingAccumulator>();

  function ensureStanding(id: { key: string; label: string; steamId?: string }) {
    let entry = standingsMap.get(id.key);
    if (!entry) {
      entry = {
        key: id.key,
        steamId: id.steamId,
        label: id.label,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesWon: 0,
        gamesLost: 0,
      };
      standingsMap.set(id.key, entry);
    }
    return entry;
  }

  const sorted = [...stage.matches].sort(
    (a, b) => (a.round ?? 0) - (b.round ?? 0) || a.orderNum - b.orderNum,
  );

  for (const m of sorted) {
    const side1Players = m.players.filter((p) => p.side === 1);
    const side2Players = m.players.filter((p) => p.side === 2);
    const id1 = participantIdentity(side1Players);
    const id2 = participantIdentity(side2Players);
    if (id1.key === 'unknown' || id2.key === 'unknown') continue;

    const s1 = ensureStanding(id1);
    const s2 = ensureStanding(id2);

    const decided =
      m.status === 'PLAYED' ||
      m.winnerSide !== null ||
      (m.side1Score !== null && m.side2Score !== null);
    if (!decided) continue;

    const score1 = m.side1Score ?? 0;
    const score2 = m.side2Score ?? 0;

    s1.played += 1;
    s2.played += 1;
    s1.gamesWon += score1;
    s1.gamesLost += score2;
    s2.gamesWon += score2;
    s2.gamesLost += score1;

    let winner = m.winnerSide;
    if (winner === null) {
      if (score1 > score2) winner = 1;
      else if (score2 > score1) winner = 2;
    }

    if (winner === 1) {
      s1.wins += 1;
      s2.losses += 1;
    } else if (winner === 2) {
      s2.wins += 1;
      s1.losses += 1;
    } else {
      s1.draws += 1;
      s2.draws += 1;
    }
  }

  const standings: RoundRobinStanding[] = Array.from(standingsMap.values())
    .map((s) => ({
      steamId: s.steamId,
      label: s.label,
      played: s.played,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      gamesWon: s.gamesWon,
      gamesLost: s.gamesLost,
      points: s.wins * 3 + s.draws,
    }))
    .sort((a, b) => b.points - a.points || b.gamesWon - b.gamesLost - (a.gamesWon - a.gamesLost));

  const roundGroups = groupMatchesByRound(sorted);
  const rounds: BracketRound[] = roundGroups.map((g) => ({
    number: g.roundNum,
    label: g.roundNum > 0 ? `Round ${g.roundNum}` : 'Matches',
    matches: g.matches.map((m, pos) => buildBracketMatch(m, pos + 1)),
  }));

  return { format: 'round_robin', status, standings, rounds, title: stage.name };
}

// ---------------------------------------------------------------------------
// Match-level mapping
// ---------------------------------------------------------------------------

function buildBracketMatch(match: BracketMatchInput, position: number): BracketMatch {
  const side1Players = match.players.filter((p) => p.side === 1);
  const side2Players = match.players.filter((p) => p.side === 2);

  const isBye =
    side1Players.some((p) => p.displayName === 'BYE') ||
    side2Players.some((p) => p.displayName === 'BYE') ||
    side1Players.length === 0 ||
    side2Players.length === 0;

  const side1 = buildSide(side1Players, match.side1Score, match.winnerSide === 1);
  const side2 = buildSide(side2Players, match.side2Score, match.winnerSide === 2);

  const games: BracketGame[] | undefined = match.games?.length
    ? match.games.map((g) => ({
        gameNumber: g.gameNumber,
        side1Score: g.side1Score ?? 0,
        side2Score: g.side2Score ?? 0,
        arena: g.arena?.name,
      }))
    : undefined;

  return {
    id: match.id,
    round: Math.abs(match.round ?? 1),
    position,
    side1,
    side2,
    bestOf: match.boSeries && match.boSeries > 0 ? match.boSeries : undefined,
    status: mapMatchStatus(match.status),
    isBye,
    label: match.label ?? undefined,
    games,
    winnerNextMatchId: match.winnerNextMatchId ?? undefined,
    loserNextMatchId: match.loserNextMatchId ?? undefined,
  };
}

function buildSide(
  players: { displayName: string; steamId?: string | null; side: number }[],
  score: number | null,
  isWinner: boolean,
): BracketSide {
  if (players.length === 0) {
    return { label: 'TBD', score: score ?? undefined, isWinner: false };
  }

  const isByeSide = players.length === 1 && players[0].displayName === 'BYE';
  if (isByeSide) {
    return { label: 'BYE', score: score ?? undefined, isWinner: false };
  }

  const label =
    players.length === 1 ? players[0].displayName : players.map((p) => p.displayName).join(' & ');

  const bracketPlayers: BracketPlayer[] = players
    .filter((p) => p.displayName !== 'BYE')
    .map((p) => ({
      name: p.displayName,
      ...(p.steamId ? { steamId: p.steamId, href: `/users/${p.steamId}` } : {}),
    }));

  return {
    label,
    players: bracketPlayers.length > 0 ? bracketPlayers : undefined,
    score: score ?? undefined,
    isWinner,
  };
}

// ---------------------------------------------------------------------------
// BYE padding for non-power-of-2 brackets
// ---------------------------------------------------------------------------

function padRoundsWithByes(rounds: BracketRound[]): void {
  for (let i = 0; i < rounds.length - 1; i++) {
    const current = rounds[i];
    const next = rounds[i + 1];
    const expectedCount = next.matches.length * 2;

    if (current.matches.length >= expectedCount) continue;

    const winnerLabels = new Set<string>();
    for (const match of current.matches) {
      const winner = match.side1.isWinner ? match.side1 : match.side2.isWinner ? match.side2 : null;
      if (winner) winnerLabels.add(winner.label);
    }

    const winnerToMatch = new Map<string, BracketMatch>();
    for (const match of current.matches) {
      const winner = match.side1.isWinner ? match.side1 : match.side2.isWinner ? match.side2 : null;
      if (winner) winnerToMatch.set(winner.label, match);
    }

    const padded: BracketMatch[] = [];
    let position = 1;

    for (const nextMatch of next.matches) {
      const s1FromCurrent = winnerLabels.has(nextMatch.side1.label);
      const s2FromCurrent = winnerLabels.has(nextMatch.side2.label);

      if (s1FromCurrent && s2FromCurrent) {
        const m1 = winnerToMatch.get(nextMatch.side1.label);
        const m2 = winnerToMatch.get(nextMatch.side2.label);
        if (m1) padded.push({ ...m1, position: position++ });
        if (m2) padded.push({ ...m2, position: position++ });
      } else if (s1FromCurrent) {
        padded.push(syntheticByeMatch(nextMatch.side2.label, current.number, position++));
        const m = winnerToMatch.get(nextMatch.side1.label);
        if (m) padded.push({ ...m, position: position++ });
      } else if (s2FromCurrent) {
        const m = winnerToMatch.get(nextMatch.side2.label);
        if (m) padded.push({ ...m, position: position++ });
        padded.push(syntheticByeMatch(nextMatch.side1.label, current.number, position++));
      } else {
        padded.push(syntheticByeMatch(nextMatch.side1.label, current.number, position++));
        padded.push(syntheticByeMatch(nextMatch.side2.label, current.number, position++));
      }
    }

    current.matches = padded;
  }
}

let byeIdCounter = 0;

function syntheticByeMatch(
  playerLabel: string,
  roundNumber: number,
  position: number,
): BracketMatch {
  return {
    id: `bye-${roundNumber}-${++byeIdCounter}`,
    round: roundNumber,
    position,
    side1: { label: playerLabel, isWinner: true },
    side2: { label: 'BYE' },
    status: 'completed',
    isBye: true,
  };
}

// ---------------------------------------------------------------------------
// Round grouping & ordering
// ---------------------------------------------------------------------------

interface RoundGroup {
  roundNum: number;
  matches: BracketMatchInput[];
}

function groupMatchesByRound(matches: BracketMatchInput[], useAbsRound = false): RoundGroup[] {
  const map = new Map<number, BracketMatchInput[]>();

  for (const m of matches) {
    const key = useAbsRound ? Math.abs(m.round ?? 0) : (m.round ?? 0);
    const arr = map.get(key) ?? [];
    arr.push(m);
    map.set(key, arr);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNum, roundMatches]) => ({
      roundNum,
      matches: roundMatches.sort((a, b) => a.orderNum - b.orderNum),
    }));
}

/**
 * Reorders each round's matches, in place, so siblings that feed the same
 * next-round match sit adjacently — this is what makes the CSS connector
 * parity (odd/even position) reliably correct instead of an accident of
 * insertion order. Falls back to the existing orderNum-based order for any
 * round where progression edges aren't available on every match.
 */
function orderGroupsByProgression(groups: RoundGroup[]): void {
  for (let i = 0; i < groups.length - 1; i++) {
    const current = groups[i];
    const next = groups[i + 1];

    const hasEdges = current.matches.every((m) => m.winnerNextMatchId != null);
    if (!hasEdges || next.matches.length === 0) continue;

    const nextIndexById = new Map(next.matches.map((m, idx) => [String(m.id), idx]));

    current.matches = [...current.matches].sort((a, b) => {
      const aIdx = nextIndexById.get(String(a.winnerNextMatchId)) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = nextIndexById.get(String(b.winnerNextMatchId)) ?? Number.MAX_SAFE_INTEGER;
      if (aIdx !== bIdx) return aIdx - bIdx;
      const aSide = a.winnerNextSide ?? 0;
      const bSide = b.winnerNextSide ?? 0;
      if (aSide !== bSide) return aSide - bSide;
      return a.orderNum - b.orderNum;
    });
  }
}

function singleElimRoundLabel(index: number, total: number): string {
  const fromEnd = total - index;
  if (fromEnd === 1) return 'Final';
  if (fromEnd === 2) return 'Semifinals';
  if (fromEnd === 3) return 'Quarterfinals';
  return `Round ${index + 1}`;
}

function winnersRoundLabel(index: number, total: number): string {
  const fromEnd = total - index;
  if (fromEnd === 1) return 'Winners Final';
  if (fromEnd === 2) return 'Winners Semifinal';
  return `Winners Round ${index + 1}`;
}

function losersRoundLabel(index: number, total: number): string {
  const fromEnd = total - index;
  if (fromEnd === 1) return 'Losers Final';
  if (fromEnd === 2) return 'Losers Semifinal';
  return `Losers Round ${index + 1}`;
}
