import type {
  BracketData,
  BracketMatch,
  BracketRound,
  BracketSide,
  BracketStatus,
  RoundRobinStanding,
} from '$lib/types/bracket';
import type {
  DraftEliminationMatch,
  DraftMatchBase,
  DraftStage,
  EventDraftPayload,
} from '$lib/types/tournament-editor';

function bracketStatus(status: EventDraftPayload['status']): BracketStatus {
  if (status === 'COMPLETED') return 'completed';
  if (status === 'REGISTRATION' || status === 'IN_PROGRESS') return 'in_progress';
  return 'upcoming';
}

function side(match: DraftMatchBase, sideNumber: 1 | 2): BracketSide {
  const players = match.players.filter((player) => player.side === sideNumber);
  if (players.length === 0) return { label: 'TBD' };
  if (players.length === 1 && players[0].displayName === 'BYE') return { label: 'BYE' };

  return {
    label: players.map((player) => player.displayName).join(' & '),
    players: players.map((player) => ({
      name: player.displayName,
      ...(player.steamId ? { steamId: player.steamId, href: `/users/${player.steamId}` } : {}),
    })),
    score: sideNumber === 1 ? (match.side1Score ?? undefined) : (match.side2Score ?? undefined),
    isWinner: match.winnerSide === sideNumber,
  };
}

function previewMatch(match: DraftMatchBase, position: number): BracketMatch {
  const side1 = side(match, 1);
  const side2 = side(match, 2);
  const elimination = match as Partial<DraftEliminationMatch>;
  return {
    id: match.id,
    round: Math.abs(match.round ?? 1),
    position,
    side1,
    side2,
    bestOf: match.boSeries,
    status: match.status === 'PLAYED' ? 'completed' : 'upcoming',
    isBye: side1.label === 'BYE' || side2.label === 'BYE',
    label: match.label ?? undefined,
    games: match.games.map((game) => ({
      gameNumber: game.gameNumber,
      side1Score: game.side1Score ?? 0,
      side2Score: game.side2Score ?? 0,
    })),
    winnerNextMatchId: elimination.winnerNextMatchId ?? undefined,
    loserNextMatchId: elimination.loserNextMatchId ?? undefined,
  };
}

function roundGroups(
  matches: DraftMatchBase[],
  absolute = false,
): Array<{
  round: number;
  matches: DraftMatchBase[];
}> {
  const groups = new Map<number, DraftMatchBase[]>();
  for (const match of matches) {
    const round = absolute ? Math.abs(match.round ?? 0) : (match.round ?? 0);
    groups.set(round, [...(groups.get(round) ?? []), match]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, grouped]) => ({
      round,
      matches: [...grouped].sort((a, b) => a.orderNum - b.orderNum),
    }));
}

function labelForRound(index: number, total: number, prefix = ''): string {
  const fromEnd = total - index;
  if (fromEnd === 1) return prefix ? `${prefix} Final` : 'Final';
  if (fromEnd === 2) return prefix ? `${prefix} Semifinal` : 'Semifinals';
  return prefix ? `${prefix} Round ${index + 1}` : `Round ${index + 1}`;
}

function roundsFor(matches: DraftMatchBase[], prefix = '', absolute = false): BracketRound[] {
  const groups = roundGroups(matches, absolute);
  return groups.map((group, index) => ({
    number: group.round,
    label: labelForRound(index, groups.length, prefix),
    matches: group.matches.map((match, position) => previewMatch(match, position + 1)),
  }));
}

function roundRobinRounds(matches: DraftMatchBase[]): BracketRound[] {
  return roundGroups(matches).map((group) => ({
    number: group.round,
    label: group.round > 0 ? `Round ${group.round}` : 'Matches',
    matches: group.matches.map((match, position) => previewMatch(match, position + 1)),
  }));
}

function roundRobinStandings(matches: DraftMatchBase[]): RoundRobinStanding[] {
  const standings = new Map<string, RoundRobinStanding>();

  function ensure(match: DraftMatchBase, sideNumber: 1 | 2): RoundRobinStanding | null {
    const players = match.players.filter((player) => player.side === sideNumber);
    if (players.length === 0) return null;
    const key = players
      .map((player) => player.steamId ?? player.displayName)
      .sort()
      .join('+');
    let standing = standings.get(key);
    if (!standing) {
      standing = {
        steamId: players.length === 1 ? (players[0].steamId ?? undefined) : undefined,
        label: players.map((player) => player.displayName).join(' & '),
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesWon: 0,
        gamesLost: 0,
        points: 0,
      };
      standings.set(key, standing);
    }
    return standing;
  }

  for (const match of matches) {
    const first = ensure(match, 1);
    const second = ensure(match, 2);
    if (!first || !second || match.status !== 'PLAYED') continue;

    const firstScore = match.side1Score ?? 0;
    const secondScore = match.side2Score ?? 0;
    first.played += 1;
    second.played += 1;
    first.gamesWon += firstScore;
    first.gamesLost += secondScore;
    second.gamesWon += secondScore;
    second.gamesLost += firstScore;

    if (match.winnerSide === 1) {
      first.wins += 1;
      second.losses += 1;
    } else if (match.winnerSide === 2) {
      second.wins += 1;
      first.losses += 1;
    } else {
      first.draws += 1;
      second.draws += 1;
    }
    first.points = first.wins * 3 + first.draws;
    second.points = second.wins * 3 + second.draws;
  }

  return [...standings.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.gamesWon - b.gamesLost - (a.gamesWon - a.gamesLost) ||
      a.label.localeCompare(b.label),
  );
}

export function previewDraftStage(
  stage: DraftStage,
  status: EventDraftPayload['status'],
): BracketData {
  const common = { status: bracketStatus(status), title: stage.name };

  if (stage.bracketFormat === 'CARD') {
    return {
      ...common,
      format: 'card',
      rounds: [
        {
          number: 1,
          label: 'Card',
          matches: [...stage.matches]
            .sort((a, b) => a.orderNum - b.orderNum)
            .map((match, index) => previewMatch(match, index + 1)),
        },
      ],
    };
  }

  if (stage.bracketFormat === 'ROUND_ROBIN') {
    return {
      ...common,
      format: 'round_robin',
      standings: roundRobinStandings(stage.matches),
      rounds: roundRobinRounds(stage.matches),
    };
  }

  if (stage.bracketFormat === 'DOUBLE_ELIM') {
    const winners = stage.matches.filter(
      (match) => match.section === 'WINNERS' || match.section === 'MAIN',
    );
    const losers = stage.matches.filter((match) => match.section === 'LOSERS');
    const grandFinal = stage.matches.filter((match) => match.section === 'GRAND_FINAL');
    return {
      ...common,
      format: 'double_elim',
      rounds: roundsFor(winners, 'Winners'),
      loserRounds: roundsFor(losers, 'Losers', true),
      grandFinal:
        grandFinal.length > 0
          ? {
              number: 0,
              label: 'Grand Final',
              matches: grandFinal.map((match, index) => previewMatch(match, index + 1)),
            }
          : undefined,
    };
  }

  return {
    ...common,
    format: 'single_elim',
    rounds: roundsFor(stage.matches),
  };
}
