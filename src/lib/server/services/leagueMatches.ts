import { prisma } from '#lib/server/db.js';
import type { LeagueMatchStatus, LeagueScheduleRow } from '#lib/types/league.js';
import { MatchStatus } from '#prisma/client.js';
import {
  divisionIdForLeagueMatch,
  isRegularSeasonLeagueMatch,
  leagueMatchSideFromTeam,
  toLeagueDivisionBye,
  toLeagueDivisionMatch,
  type LeagueTeamSideInput,
} from '#lib/utils/leagueMatches.js';

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
): Promise<Record<number, LeagueScheduleRow[]>> {
  const [rows, byes] = await Promise.all([
    prisma.match.findMany({
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
    }),
    prisma.byeWeek.findMany({
      where: {
        seasonId,
        team: { regionId, divisionId: { not: null } },
      },
      select: {
        id: true,
        weekNo: true,
        team: { select: teamSelect },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  const grouped: Record<number, LeagueScheduleRow[]> = {};

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

  for (const bye of byes) {
    const divisionId = bye.team.divisionId;
    if (divisionId == null) continue;

    (grouped[divisionId] ??= []).push(
      toLeagueDivisionBye({
        id: bye.id,
        weekNo: bye.weekNo,
        team: leagueMatchSideFromTeam(sideInputFromTeam(bye.team)),
      }),
    );
  }

  return grouped;
}

/** True once this season has a reported result (played or disputed). */
export async function seasonHasPlayedMatches(seasonId: number): Promise<boolean> {
  const match = await prisma.match.findFirst({
    where: {
      seasonId,
      status: { in: [MatchStatus.PLAYED, MatchStatus.DISPUTE] },
    },
    select: { id: true },
  });
  return match != null;
}
