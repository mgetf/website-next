/**
 * Smoke-exercise all Rama modules via REST JSON.
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
  createNotificationsClient,
  getUnreadCount,
  markAllRead,
  markRead,
  notify,
} from '../src/lib/server/rama/notifications';
import {
  confirmItemOrder,
  createItemOrder,
  createPaymentsClient,
  expireItemOrder,
  getItemOrderStatus,
  getPlayerPaymentStatus,
  getTeamPaidCount,
  markPaid,
} from '../src/lib/server/rama/payments';
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
  createSeason,
  createSeasonsClient,
  getSeason,
  getSeasonSignupsOpen,
  lookupSeasonId,
  setSeasonFlags,
  setSeasonInfo,
  setSeasonSchedule,
  updateSeason,
} from '../src/lib/server/rama/seasons';
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

  const payments = createPaymentsClient({ conductorUrl, supervisorBaseUrl });
  const seasonId = 'season-spike';
  console.log(
    'markPaid',
    await markPaid(payments, {
      steamId,
      seasonId,
      teamId,
      status: 'PAID',
      amount: 25,
      source: 'SMOKE',
      paymentId: `pay-${Date.now()}`,
    }),
  );
  console.log('playerPayment', await getPlayerPaymentStatus(payments, steamId, seasonId));
  console.log('teamPaidCount', await getTeamPaidCount(payments, teamId));

  const orderId = `ord-${Date.now()}`;
  console.log(
    'createItemOrder',
    await createItemOrder(payments, {
      orderId,
      steamId: mateId,
      teamId,
      seasonId,
      amount: 25,
    }),
  );
  console.log('orderStatus', await getItemOrderStatus(payments, orderId));
  console.log('confirmItemOrder', await confirmItemOrder(payments, orderId));
  console.log('orderStatus after confirm', await getItemOrderStatus(payments, orderId));
  console.log('matePayment', await getPlayerPaymentStatus(payments, mateId, seasonId));

  const expireOrderId = `ord-exp-${Date.now()}`;
  console.log(
    'createItemOrder (expire)',
    await createItemOrder(payments, {
      orderId: expireOrderId,
      steamId: `${steamId}-exp`,
      teamId,
      seasonId,
      amount: 25,
    }),
  );
  console.log('expireItemOrder', await expireItemOrder(payments, expireOrderId));
  console.log('expiredStatus', await getItemOrderStatus(payments, expireOrderId));

  const notifications = createNotificationsClient({ conductorUrl, supervisorBaseUrl });
  const notifId = `n-${Date.now()}`;
  console.log(
    'notify',
    await notify(notifications, {
      steamId,
      id: notifId,
      notifType: 'PAYMENT',
      body: 'Payment confirmed',
      href: `/users/${steamId}/payments`,
      createdAt: new Date().toISOString(),
    }),
  );
  console.log('unread', await getUnreadCount(notifications, steamId));
  console.log('markRead', await markRead(notifications, { steamId, id: notifId }));
  console.log('unread after read', await getUnreadCount(notifications, steamId));
  const notifId2 = `n2-${Date.now()}`;
  console.log(
    'notify2',
    await notify(notifications, {
      steamId,
      id: notifId2,
      notifType: 'TEAM',
      body: 'Team status changed',
      href: `/teams/${teamId}`,
      createdAt: new Date().toISOString(),
    }),
  );
  console.log('markAllRead', await markAllRead(notifications, steamId));
  console.log('unread after mark-all', await getUnreadCount(notifications, steamId));

  const seasons = createSeasonsClient({ conductorUrl, supervisorBaseUrl });
  const seasonKey = `season-${Date.now()}`;
  console.log(
    'createSeason',
    await createSeason(seasons, {
      seasonId: seasonKey,
      seasonNum: 99,
      numWeeks: 8,
      regionId: 'na',
      formatId: '2',
    }),
  );
  console.log('lookupSeasonId', await lookupSeasonId(seasons, 'na', '2', 99));
  console.log(
    'setSeasonFlags',
    await setSeasonFlags(seasons, {
      seasonId: seasonKey,
      signupsOpen: true,
      rosterLocked: false,
      paymentRequired: true,
    }),
  );
  console.log('signupsOpen', await getSeasonSignupsOpen(seasons, seasonKey));
  console.log(
    'setSeasonSchedule',
    await setSeasonSchedule(seasons, {
      seasonId: seasonKey,
      matchWeek: 1,
      matchDeadline: '2026-08-01T00:00:00Z',
    }),
  );
  console.log(
    'setSeasonInfo',
    await setSeasonInfo(seasons, { seasonId: seasonKey, info: 'Smoke' }),
  );
  console.log('updateSeason', await updateSeason(seasons, { seasonId: seasonKey, numWeeks: 10 }));
  console.log('season', await getSeason(seasons, seasonKey));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
