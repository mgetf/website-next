/**
 * Smoke-exercise the MatchModule via Rama REST JSON.
 *
 * Requires a running Rama cluster with MatchModule launched, and:
 *   RAMA_CONDUCTOR_URL=http://localhost:8888
 *   RAMA_SUPERVISOR_URL=http://localhost:2000   # optional override
 *
 * Usage:
 *   bun run scripts/rama-smoke.ts
 */
import {
  banMap,
  createMatch,
  createMatchClient,
  getMapBanTurn,
  getMatch,
  getMatchStatus,
  getRemainingArenas,
  getTeamWins,
  submitScore,
} from '../src/lib/server/rama/match';

const conductorUrl = process.env.RAMA_CONDUCTOR_URL ?? 'http://localhost:8888';
const supervisorBaseUrl = process.env.RAMA_SUPERVISOR_URL;

async function main() {
  const client = createMatchClient({ conductorUrl, supervisorBaseUrl });
  const matchId = `smoke-${Date.now()}`;

  console.log('module', client.moduleName);
  console.log('creating', matchId);

  const created = await createMatch(client, {
    type: 'create-match',
    matchId,
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    seasonId: 'season-spike',
    boGames: 2,
    pool: ['process', 'discard', 'viggle', 'asa', 'product'],
  });
  console.log('create ack', created);

  const awayBan = await banMap(client, {
    type: 'ban-map',
    matchId,
    teamId: 'team-away',
    arenaId: 'process',
  });
  console.log('away ban', awayBan);

  const homeBan = await banMap(client, {
    type: 'ban-map',
    matchId,
    teamId: 'team-home',
    arenaId: 'discard',
  });
  console.log('home ban', homeBan);
  console.log('turn', await getMapBanTurn(client, matchId));
  console.log('remaining', await getRemainingArenas(client, matchId));
  console.log('match', await getMatch(client, matchId));

  const scored = await submitScore(client, {
    type: 'submit-score',
    matchId,
    homeScore: 2,
    awayScore: 1,
  });
  console.log('score ack', scored);
  console.log('status', await getMatchStatus(client, matchId));
  console.log('home wins', await getTeamWins(client, 'team-home'));
  console.log('away wins', await getTeamWins(client, 'team-away'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
