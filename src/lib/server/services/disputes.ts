import { MatchStatus } from '$lib/types/enums';
/**
 * Disputes Service
 *
 * All dispute-related business logic and database operations.
 */

/**
 * Get all disputed matches with team and season info
 */
export async function getDisputedMatches(): Promise<
  Array<{
    id: number;
    status: MatchStatus;
    seasonId: number;
    seasonNo: number;
    weekNo: number | null;
    winnerScore: number | null;
    loserScore: number | null;
    homeTeamId: number;
    awayTeamId: number;
    winnerId: number | null;
    homeTeam: { id: number; name: string };
    awayTeam: { id: number; name: string };
    season: { id: number; seasonNum: number; region: { name: string } };
    winner: { id: number; name: string } | null;
  }>
> {
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
        weekNo: match.weekNo != null ? Number(match.weekNo) : null,
        winnerScore: match.winnerScore != null ? Number(match.winnerScore) : null,
        loserScore: match.loserScore != null ? Number(match.loserScore) : null,
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
    return rows;
  }

  return [];
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
  throw new Error('resolveDispute requires DATA_BACKEND=rama');
}
