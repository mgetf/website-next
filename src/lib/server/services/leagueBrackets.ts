import { prisma } from '#lib/server/db.js';
import type { LeaguePlayoffDivision, LeaguePlayoffPlacement } from '#lib/types/league.js';
import { listSeasonPlayoffPlacements } from '#lib/server/services/playoffPlacements.js';
import {
  buildLeaguePlayoffDivisions,
  buildLeagueSlotBracket,
  type LeaguePlayoffMatchInput,
  type LeaguePlayoffSideInput,
  type LeaguePlayoffSlotInput,
} from '#lib/server/utils/leagueBrackets.js';
import { PlayoffFormat, type BracketSection } from '#prisma/client.js';

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

/** Playoff trees for a season+region. Stored slots draw a bracket. Older matches stay a round list. */
export async function getLeaguePlayoffsByDivision(
  seasonId: number,
  regionId: number,
): Promise<LeaguePlayoffDivision[]> {
  const [slotRows, legacyRows, placements] = await Promise.all([
    prisma.playoffSlot.findMany({
      where: { seasonId, division: { regionId } },
      include: {
        division: { select: { id: true, name: true } },
        team1: { select: teamSelect },
        team2: { select: teamSelect },
        match: {
          select: {
            id: true,
            status: true,
            boSeries: true,
            winnerId: true,
            winnerScore: true,
            loserScore: true,
            homeTeamId: true,
          },
        },
      },
      orderBy: [{ round: 'asc' }, { position: 'asc' }, { id: 'asc' }],
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
    listSeasonPlayoffPlacements(seasonId, regionId),
  ]);

  const byDivision = new Map<number, LeaguePlayoffSlotInput[]>();
  for (const row of slotRows) {
    const slot: LeaguePlayoffSlotInput = {
      id: row.id,
      divisionId: row.divisionId,
      divisionName: row.division.name,
      format: row.format === PlayoffFormat.DOUBLE_ELIM ? 'DOUBLE_ELIM' : 'SINGLE_ELIM',
      section: row.section as BracketSection,
      round: row.round,
      position: row.position,
      isBye: row.isBye,
      winnerNextSlotId: row.winnerNextSlotId,
      winnerNextSide: row.winnerNextSide,
      loserNextSlotId: row.loserNextSlotId,
      team1: row.team1 ? sideFromTeam(row.team1) : null,
      team2: row.team2 ? sideFromTeam(row.team2) : null,
      match: row.match
        ? {
            id: row.match.id,
            status: row.match.status,
            boSeries: row.match.boSeries,
            winnerId: row.match.winnerId,
            winnerScore: row.match.winnerScore,
            loserScore: row.match.loserScore,
            homeTeamId: row.match.homeTeamId,
          }
        : null,
    };
    const group = byDivision.get(row.divisionId) ?? [];
    group.push(slot);
    byDivision.set(row.divisionId, group);
  }

  const slottedIds = new Set(byDivision.keys());
  const slotDivisions = [...byDivision.values()].flatMap((slots) => {
    const division = buildLeagueSlotBracket(slots);
    if (!division) return [];
    division.placements = placementsFor(placements, division.divisionId);
    return [division];
  });

  const legacyMatches: LeaguePlayoffMatchInput[] = legacyRows
    .filter((row) => row.homeTeam.divisionId == null || !slottedIds.has(row.homeTeam.divisionId))
    .map((row) => ({
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

  return [...slotDivisions, ...buildLeaguePlayoffDivisions(legacyMatches)].sort(
    (a, b) => b.divisionId - a.divisionId,
  );
}

function placementsFor(
  placements: Array<LeaguePlayoffPlacement & { divisionId: number }>,
  divisionId: number,
): LeaguePlayoffPlacement[] {
  return placements
    .filter((placement) => placement.divisionId === divisionId)
    .map(({ place, label, href }) => ({ place, label, href }));
}
