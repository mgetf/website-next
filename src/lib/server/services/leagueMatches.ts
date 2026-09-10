import { prisma } from '$lib/server/db';
import type { LeagueDivisionMatch, LeagueMatchStatus } from '$lib/types/league';
import {
  divisionIdForLeagueMatch,
  isRegularSeasonLeagueMatch,
  leagueMatchSideFromTeam,
  toLeagueDivisionMatch,
  type LeagueTeamSideInput,
} from '$lib/utils/leagueMatches';

const teamSelect = {
  id: true,
  name: true,
  avatar: true,
  divisionId: true,
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

function sideInputFromTeam(team: {
  id: number;
  name: string;
  avatar: string | null;
  format: { isIndividual: boolean };
  players: Array<{
    playerSteamId: string;
    player: { steamUsername: string; steamAvatar: string | null } | null;
  }>;
}): LeagueTeamSideInput {
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
    isIndividual: team.format.isIndividual,
    player,
  };
}

/** Regular-season matches for a season+region, keyed by the home team's division. */
export async function getLeagueMatchesByDivision(
  seasonId: number,
  regionId: number,
): Promise<Record<number, LeagueDivisionMatch[]>> {
  const rows = await prisma.match.findMany({
    where: {
      seasonId,
      playoffId: null,
      weekNo: { not: null },
      homeTeam: { regionId },
    },
    select: {
      id: true,
      weekNo: true,
      playoffId: true,
      status: true,
      winnerId: true,
      winnerScore: true,
      loserScore: true,
      homeTeamId: true,
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
    },
    orderBy: [{ weekNo: 'asc' }, { id: 'asc' }],
  });

  const grouped: Record<number, LeagueDivisionMatch[]> = {};

  for (const row of rows) {
    if (!isRegularSeasonLeagueMatch(row) || row.weekNo == null) continue;

    const divisionId = divisionIdForLeagueMatch(row.homeTeam.divisionId, row.awayTeam.divisionId);
    if (divisionId == null) continue;

    const match = toLeagueDivisionMatch({
      id: row.id,
      weekNo: row.weekNo,
      status: row.status as LeagueMatchStatus,
      home: leagueMatchSideFromTeam(sideInputFromTeam(row.homeTeam)),
      away: leagueMatchSideFromTeam(sideInputFromTeam(row.awayTeam)),
      winnerId: row.winnerId,
      homeTeamId: row.homeTeamId,
      winnerScore: row.winnerScore,
      loserScore: row.loserScore,
    });

    (grouped[divisionId] ??= []).push(match);
  }

  return grouped;
}
