import { prisma } from '#lib/server/db.js';
import type { PlayoffPodiumPlace } from '#lib/server/utils/playoffPodium.js';
import type { LeaguePlayoffPlacement } from '#lib/types/league.js';
import type { Prisma } from '#prisma/client.js';

const PLACE_LABEL: Record<number, string> = {
  1: '1st Place',
  2: '2nd Place',
  3: '3rd Place',
};

export type PlayoffAchievement = {
  id: number;
  teamId: number;
  placement: string;
  name: string;
};

export async function saveDivisionPlayoffPlacements(
  tx: Prisma.TransactionClient,
  seasonId: number,
  divisionId: number,
  places: PlayoffPodiumPlace[],
) {
  await tx.playoffPlacement.deleteMany({ where: { seasonId, divisionId } });
  if (places.length === 0) return;
  await tx.playoffPlacement.createMany({
    data: places.map((place) => ({
      seasonId,
      divisionId,
      teamId: place.teamId,
      place: place.place,
    })),
  });
}

export async function listPlayoffAchievementsForTeams(
  teamIds: number[],
): Promise<PlayoffAchievement[]> {
  if (teamIds.length === 0) return [];

  const rows = await prisma.playoffPlacement.findMany({
    where: { teamId: { in: teamIds } },
    include: {
      division: { select: { name: true } },
      season: {
        select: {
          seasonNum: true,
          region: { select: { name: true } },
          format: { select: { name: true } },
        },
      },
    },
    orderBy: [{ season: { seasonNum: 'desc' } }, { place: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    teamId: row.teamId,
    placement: PLACE_LABEL[row.place] ?? `#${row.place}`,
    name: `${row.season.region.name} ${row.season.format.name} Season ${row.season.seasonNum} · ${row.division.name}`,
  }));
}

export async function listSeasonPlayoffPlacements(
  seasonId: number,
  regionId: number,
): Promise<Array<LeaguePlayoffPlacement & { divisionId: number }>> {
  const rows = await prisma.playoffPlacement.findMany({
    where: { seasonId, division: { regionId } },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          format: { select: { isIndividual: true } },
          players: {
            where: { active: 1 },
            take: 1,
            select: {
              playerSteamId: true,
              player: { select: { steamUsername: true } },
            },
          },
        },
      },
    },
    orderBy: { place: 'asc' },
  });

  return rows.map((row) => {
    const membership = row.team.players[0];
    const individual = row.team.format.isIndividual && membership;
    return {
      divisionId: row.divisionId,
      place: row.place,
      label: individual ? membership.player?.steamUsername || row.team.name : row.team.name,
      href: individual ? `/users/${membership.playerSteamId}` : `/teams/${row.team.id}`,
    };
  });
}
