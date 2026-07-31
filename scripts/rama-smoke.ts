/**
 * Smoke-exercise MatchModule + UsersModule + TeamsModule via Rama REST JSON.
 *
 * Requires a running Rama cluster with modules launched, and:
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
import {
  createTeam,
  createTeamsClient,
  getPlayerSeasonTeam,
  getTeam,
  joinTeam,
  leaveTeam,
  setMemberPermission,
  setTeamStatus,
} from '../src/lib/server/rama/teams';
import {
  bumpSession,
  createUsersClient,
  getSessionVersion,
  getUser,
  linkDiscord,
  setBan,
  setPermission,
  upsertProfile,
} from '../src/lib/server/rama/users';

const conductorUrl = process.env.RAMA_CONDUCTOR_URL ?? 'http://localhost:8888';
const supervisorBaseUrl = process.env.RAMA_SUPERVISOR_URL;

async function main() {
  const users = createUsersClient({ conductorUrl, supervisorBaseUrl });
  const steamId = `smoke-user-${Date.now()}`;
  console.log(
    'users upsert',
    await upsertProfile(users, {
      steamId,
      username: 'smoke',
      avatarUrl: 'http://example/a.png',
    }),
  );
  console.log('setPermission', await setPermission(users, { steamId, permissionLevel: 'GUEST' }));
  console.log('setBan', await setBan(users, { steamId, banStatus: 'NONE' }));
  console.log('bumpSession', await bumpSession(users, steamId));
  console.log('linkDiscord', await linkDiscord(users, { steamId, discordId: `d-${steamId}` }));
  console.log('user', await getUser(users, steamId));
  console.log('sessionVersion', await getSessionVersion(users, steamId));

  const teams = createTeamsClient({ conductorUrl, supervisorBaseUrl });
  const teamId = `team-${Date.now()}`;
  const mateId = `${steamId}-mate`;
  console.log(
    'createTeam',
    await createTeam(teams, {
      teamId,
      steamId,
      name: 'Smoke',
      acronym: 'SMK',
      formatId: '2',
      seasonId: 'season-spike',
      divisionId: 'div-1',
      regionId: 'reg-1',
    }),
  );
  console.log('joinTeam', await joinTeam(teams, { teamId, steamId: mateId }));
  console.log(
    'setMemberPermission',
    await setMemberPermission(teams, {
      teamId,
      steamId: mateId,
      permissionLevel: 'ADMIN',
    }),
  );
  console.log('setTeamStatus', await setTeamStatus(teams, { teamId, status: 'PENDING' }));
  console.log('team', await getTeam(teams, teamId));
  console.log('playerSeason', await getPlayerSeasonTeam(teams, steamId, 'season-spike'));
  console.log('leaveTeam', await leaveTeam(teams, { teamId, steamId: mateId }));

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
