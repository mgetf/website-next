/**
 * Disputes Service
 *
 * All dispute-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { MatchStatus } from '$prisma/client.js';

/**
 * Get all disputed matches with team and season info
 */
export async function getDisputedMatches() {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatch, getMatchIdsByStatus } =
      await import('$lib/server/rama/match');
    const { getTeamById } = await import('$lib/server/services/teams');
    const { getSeasonById } = await import('$lib/server/services/seasons');
    const client = createMatchClient(ramaClientOpts());
    const ids = await getMatchIdsByStatus(client, 'DISPUTE');
    const rows = [];
    for (const matchId of ids) {
      const match = await getMatch(client, matchId);
      if (!match) continue;
      const homeTeamId = Number(match.homeTeamId);
      const awayTeamId = Number(match.awayTeamId);
      const seasonId = Number(match.seasonId);
      const winnerIdRaw = match.winnerId ? Number(match.winnerId) : null;
      const [homeTeam, awayTeam, season, winner] = await Promise.all([
        getTeamById(homeTeamId),
        getTeamById(awayTeamId),
        getSeasonById(seasonId),
        winnerIdRaw && Number.isFinite(winnerIdRaw) ? getTeamById(winnerIdRaw) : null,
      ]);
      rows.push({
        id: Number(matchId),
        status: MatchStatus.DISPUTE,
        seasonId,
        seasonNo: Number(match.seasonNo ?? season?.seasonNum ?? 0),
        homeTeamId,
        awayTeamId,
        winnerId: winnerIdRaw && Number.isFinite(winnerIdRaw) ? winnerIdRaw : null,
        homeTeam: homeTeam
          ? { id: homeTeam.id, name: homeTeam.name }
          : { id: homeTeamId, name: String(homeTeamId) },
        awayTeam: awayTeam
          ? { id: awayTeam.id, name: awayTeam.name }
          : { id: awayTeamId, name: String(awayTeamId) },
        season: season
          ? {
              id: season.id,
              seasonNum: season.seasonNum,
              region: season.region
                ? { name: season.region.name }
                : { name: String(season.regionId) },
            }
          : { id: seasonId, seasonNum: 0, region: { name: '' } },
        winner: winner ? { id: winner.id, name: winner.name } : null,
      });
    }
    rows.sort((a, b) => b.id - a.id);
    return rows as unknown as Awaited<ReturnType<typeof getDisputedMatchesFromPrisma>>;
  }

  return getDisputedMatchesFromPrisma();
}

async function getDisputedMatchesFromPrisma() {
  return await prisma.match.findMany({
    where: {
      status: MatchStatus.DISPUTE,
    },
    include: {
      homeTeam: {
        select: { id: true, name: true },
      },
      awayTeam: {
        select: { id: true, name: true },
      },
      season: {
        select: {
          id: true,
          seasonNum: true,
          region: {
            select: { name: true },
          },
        },
      },
      winner: {
        select: { id: true, name: true },
      },
    },
    orderBy: {
      id: 'desc',
    },
  });
}

/**
 * Resolve a dispute by updating match status
 */
export async function resolveDispute(matchId: number, newStatus: MatchStatus) {
  if (newStatus === MatchStatus.DISPUTE) {
    throw new Error('Cannot set status to DISPUTE');
  }

  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatch, setMatchStatus } = await import('$lib/server/rama/match');
    const client = createMatchClient(ramaClientOpts());
    const match = await getMatch(client, String(matchId));
    if (!match) throw new Error('Match not found');
    const ack = await setMatchStatus(client, {
      matchId: String(matchId),
      status: newStatus === MatchStatus.UNPLAYED ? 'UNPLAYED' : 'PLAYED',
    });
    if (!ack.ok) throw new Error(ack.error || 'Failed to resolve dispute');
    return { id: matchId, status: newStatus };
  }

  return await prisma.match.update({
    where: { id: matchId },
    data: { status: newStatus },
  });
}
