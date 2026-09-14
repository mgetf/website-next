import { prisma } from '$lib/server/db';
import type { LeaguePlayoffDivision } from '$lib/types/league';
import {
  buildLeaguePlayoffDivisions,
  type LeaguePlayoffMatchInput,
  type LeaguePlayoffSideInput,
} from '$lib/server/utils/leagueBrackets';

const teamSelect = {
  id: true,
  name: true,
  avatar: true,
  divisionId: true,
  division: { select: { name: true } },
  format: { select: { isIndividual: true } },
  players: {
    where: { active: 1 },
    take: 1,
    select: {
      playerSteamId: true,
      player: {
        select: {
          steamUsername: true,
          steamAvatar: true,
        },
      },
    },
  },
} as const;

function sideFromTeam(team: {
  id: number;
  name: string;
  avatar: string | null;
  divisionId: number | null;
  division: { name: string } | null;
  format: { isIndividual: boolean };
  players: Array<{
    playerSteamId: string;
    player: { steamUsername: string; steamAvatar: string | null } | null;
  }>;
}): LeaguePlayoffSideInput {
  const membership = team.players[0];
  const player = membership?.player
    ? {
        steamId: membership.playerSteamId,
        name: membership.player.steamUsername || team.name,
        avatar: membership.player.steamAvatar,
      }
    : null;

  return {
    id: team.id,
    name: team.name,
    avatar: team.avatar,
    divisionId: team.divisionId,
    divisionName: team.division?.name ?? null,
    isIndividual: team.format.isIndividual,
    player,
  };
}

/** Playoff trees for a season+region, one per division that has playoff matches. */
export async function getLeaguePlayoffsByDivision(
  seasonId: number,
  regionId: number,
): Promise<LeaguePlayoffDivision[]> {
  const [playoff, rows] = await Promise.all([
    prisma.playoff.findFirst({
      where: { seasonId },
      select: { doubleElim: true },
    }),
    prisma.match.findMany({
      where: {
        seasonId,
        playoffId: { not: null },
        playoffRound: { not: null },
        homeTeam: { regionId },
      },
      select: {
        id: true,
        playoffRound: true,
        status: true,
        boSeries: true,
        winnerId: true,
        winnerScore: true,
        loserScore: true,
        homeTeamId: true,
        homeTeam: { select: teamSelect },
        awayTeam: { select: teamSelect },
      },
      orderBy: [{ playoffRound: 'asc' }, { id: 'asc' }],
    }),
  ]);

  if (rows.length === 0) return [];

  const matches: LeaguePlayoffMatchInput[] = rows.map((row) => ({
    id: row.id,
    playoffRound: row.playoffRound,
    status: row.status,
    boSeries: row.boSeries,
    winnerId: row.winnerId,
    winnerScore: row.winnerScore,
    loserScore: row.loserScore,
    homeTeamId: row.homeTeamId,
    home: sideFromTeam(row.homeTeam),
    away: sideFromTeam(row.awayTeam),
  }));

  return buildLeaguePlayoffDivisions(matches, playoff?.doubleElim === 1);
}
