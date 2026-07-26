import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  loginAs,
  submitBo1Scores,
  submitSeriesScores,
  postMatchMessage,
  requestReschedule,
  acceptReschedule,
  denyReschedule,
  fileDispute,
  adminResolveDisputePanel,
  banOrPickMap,
  adminCreateWeekMatch,
  adminCreatePlayoffMatch,
  adminEditSchedule,
  adminEditArenas,
  adminDeclinePendingPlayer,
  captainRemovePlayer,
  readInviteLink,
  acceptInviteLink,
  declineSteamInvitation,
  cancelPendingInvite,
  adminMarkPlayerPaid,
  reportDemoOnMatch,
  adminResolveDemoReport,
  adminCreateLeagueRegion,
  adminCreateLeagueDivision,
  adminCreateLeagueArena,
  adminCreateLeagueSeason,
} from './helpers/auth';
import {
  E2E_USERS,
  resetDatabase,
  seedLeagueInfrastructure,
  seedUsers,
  seedReadyTeam,
  seedDemo,
  getMatchStatus,
  getLatestMatchId,
  getTeamByName,
  getTeamStatus,
  getMapBanComplete,
  getTeamWins,
  getMatchTeams,
  getUserBanStatus,
  countNotifications,
  getPlayerPaymentStatus,
  countDemoReports,
  type SeasonSeed,
} from './helpers/season';

/**
 * Full-platform 2v2 (+ adjacent) season god path.
 *
 * Covers signup/roster (password join, decline, invite link, steam invite
 * accept/decline/cancel, promote/demote/remove), admin match creation, match
 * ops (comms/reschedule/schedule/arenas/scores/dispute), demo report triage,
 * playoff map bans, standings, notifications, paid-division mark-paid, 1v1
 * signup/ready/withdraw, ban/clear, announcements, admin league CMS creates,
 * and browse-surface smoke — in one serial suite.
 *
 * External/HARD paths (Steam OAuth, Discord, PayPal, R2 uploads) stay out;
 * auth uses /auth/test-login. Demo upload is seeded (no R2) then reported in UI.
 */
test.describe.configure({ mode: 'serial' });

type Session = { context: BrowserContext; page: Page };

let league: SeasonSeed;
let homeTeamId: number;
let awayTeamId: number;
let paidTeamId: number;
let weekMatchId: number;
let playoffMatchId: number;

let admin: Session;
let homeCaptain: Session;
let homeTeammate: Session;
let homeInvitee: Session;
let homeDeclined: Session;
let homeLinkJoiner: Session;
let homeInviteDecliner: Session;
let awayCaptain: Session;
let awayTeammate: Session;
let solo1v1: Session;

const JOIN_PASSWORD = 'join-pass-123';
const HOME_TEAM_NAME = 'Alpha Force';
const AWAY_TEAM_NAME = 'Bravo Unit';
const PAID_TEAM_NAME = 'Charlie Cash';
const ANNOUNCEMENT = 'E2E announcement: season god path live';
const UI_REGION = 'E2E UI Region';
const UI_DIVISION = 'E2E UI Division';
const UI_ARENA = 'E2E UI Arena';

async function closeAll() {
  await Promise.all(
    [
      admin,
      homeCaptain,
      homeTeammate,
      homeInvitee,
      homeDeclined,
      homeLinkJoiner,
      homeInviteDecliner,
      awayCaptain,
      awayTeammate,
      solo1v1,
    ]
      .filter(Boolean)
      .map((s) => s.context.close()),
  );
}

test.afterAll(async () => {
  await closeAll();
});

test('seed league, create home team, seed away + paid teams, open sessions', async ({ browser }) => {
  test.setTimeout(300_000);
  process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5432/mgetf_test';

  await resetDatabase();
  await seedUsers();
  league = await seedLeagueInfrastructure();

  awayTeamId = await seedReadyTeam({
    name: AWAY_TEAM_NAME,
    acronym: 'BRA',
    captainSteamId: E2E_USERS.awayCaptain.steamId,
    teammateSteamId: E2E_USERS.awayTeammate.steamId,
    regionId: league.regionId,
    divisionId: league.divisionId,
    seasonId: league.seasonId,
    joinPassword: JOIN_PASSWORD,
  });

  paidTeamId = await seedReadyTeam({
    name: PAID_TEAM_NAME,
    acronym: 'CHC',
    captainSteamId: E2E_USERS.paidCaptain.steamId,
    teammateSteamId: E2E_USERS.paidTeammate.steamId,
    regionId: league.regionId,
    divisionId: league.paidDivisionId,
    seasonId: league.seasonId,
    joinPassword: JOIN_PASSWORD,
    paymentStatus: 0,
    status: 'UNREADY',
  });

  admin = await loginAs(browser, {
    steamId: E2E_USERS.admin.steamId,
    username: E2E_USERS.admin.username,
    role: 'ADMIN',
    redirect: '/admin',
  });
  homeCaptain = await loginAs(browser, {
    steamId: E2E_USERS.homeCaptain.steamId,
    username: E2E_USERS.homeCaptain.username,
    redirect: '/signup/2v2/create',
  });
  homeTeammate = await loginAs(browser, {
    steamId: E2E_USERS.homeTeammate.steamId,
    username: E2E_USERS.homeTeammate.username,
  });
  homeInvitee = await loginAs(browser, {
    steamId: E2E_USERS.homeInvitee.steamId,
    username: E2E_USERS.homeInvitee.username,
  });
  homeDeclined = await loginAs(browser, {
    steamId: E2E_USERS.homeDeclined.steamId,
    username: E2E_USERS.homeDeclined.username,
  });
  homeLinkJoiner = await loginAs(browser, {
    steamId: E2E_USERS.homeLinkJoiner.steamId,
    username: E2E_USERS.homeLinkJoiner.username,
  });
  homeInviteDecliner = await loginAs(browser, {
    steamId: E2E_USERS.homeInviteDecliner.steamId,
    username: E2E_USERS.homeInviteDecliner.username,
  });
  awayCaptain = await loginAs(browser, {
    steamId: E2E_USERS.awayCaptain.steamId,
    username: E2E_USERS.awayCaptain.username,
    redirect: `/teams/${awayTeamId}`,
  });
  awayTeammate = await loginAs(browser, {
    steamId: E2E_USERS.awayTeammate.steamId,
    username: E2E_USERS.awayTeammate.username,
    redirect: `/teams/${awayTeamId}`,
  });
  solo1v1 = await loginAs(browser, {
    steamId: E2E_USERS.solo1v1.steamId,
    username: E2E_USERS.solo1v1.username,
  });

  await expect(awayCaptain.page.getByRole('heading', { name: AWAY_TEAM_NAME })).toBeVisible();

  // --- Home captain creates team via signup UI ---
  await expect(homeCaptain.page.getByRole('heading', { name: 'Create New Team' })).toBeVisible();
  await homeCaptain.page.locator('#name').fill(HOME_TEAM_NAME);
  await homeCaptain.page.locator('#acronym').fill('ALP');
  await homeCaptain.page.locator('#regionId').selectOption({ label: 'E2E Region' });
  await expect(
    homeCaptain.page.locator('#divisionId option').filter({ hasText: 'Invite' }),
  ).toHaveCount(1, { timeout: 10_000 });
  await homeCaptain.page.locator('#divisionId').selectOption(String(league.divisionId));
  await homeCaptain.page.locator('#joinPassword').fill(JOIN_PASSWORD);
  await homeCaptain.page.locator('input[name="rules"]').check();

  await Promise.all([
    homeCaptain.page.waitForURL(/\/teams\/\d+/),
    homeCaptain.page.getByRole('button', { name: 'Create Team' }).click(),
  ]);

  const created = await getTeamByName(HOME_TEAM_NAME);
  homeTeamId = created.id;
  expect(created.status).toBe('UNREADY');
});

test('join approve ready; decline pending; invite/promote/remove; link join; decline/cancel invite', async () => {
  test.setTimeout(300_000);

  // Password join
  await homeTeammate.page.goto(`/teams/${homeTeamId}/join`);
  await homeTeammate.page.locator('#password').fill(JOIN_PASSWORD);
  await Promise.all([
    homeTeammate.page.waitForURL(
      (url) =>
        url.pathname === `/teams/${homeTeamId}` &&
        url.searchParams.get('joined') === 'awaiting-admin',
    ),
    homeTeammate.page.getByRole('button', { name: 'Request to Join' }).click(),
  ]);

  // Admin approves teammate
  await admin.page.goto('/admin/pending-players');
  await expect(admin.page.getByText(E2E_USERS.homeTeammate.username)).toBeVisible();
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: '✓ Approve' }).click(),
  ]);
  await expect(admin.page.getByText('No pending player requests')).toBeVisible({
    timeout: 15_000,
  });

  // Decline path: password join → admin declines with reason
  await homeDeclined.page.goto(`/teams/${homeTeamId}/join`);
  await homeDeclined.page.locator('#password').fill(JOIN_PASSWORD);
  await Promise.all([
    homeDeclined.page.waitForURL(
      (url) =>
        url.pathname === `/teams/${homeTeamId}` &&
        url.searchParams.get('joined') === 'awaiting-admin',
    ),
    homeDeclined.page.getByRole('button', { name: 'Request to Join' }).click(),
  ]);
  await admin.page.goto('/admin/pending-players');
  await adminDeclinePendingPlayer(admin.page, E2E_USERS.homeDeclined.username, 'E2E decline reason');
  await expect(admin.page.getByText('No pending player requests')).toBeVisible({
    timeout: 15_000,
  });

  // Ready Up → PENDING → admin READY
  await homeCaptain.page.goto(`/teams/${homeTeamId}`);
  await homeCaptain.page.getByRole('button', { name: 'Ready Up' }).click();
  await expect(homeCaptain.page.getByText('Mark Alpha Force as ready?')).toBeVisible();
  await Promise.all([
    homeCaptain.page.waitForLoadState('networkidle'),
    homeCaptain.page.getByRole('button', { name: 'Ready Up' }).nth(1).click(),
  ]);
  expect(await getTeamStatus(homeTeamId)).toBe('PENDING');

  await admin.page.goto(`/teams/${homeTeamId}`);
  await admin.page.locator('#status').selectOption('READY');
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: 'Update Status' }).click(),
  ]);
  expect(await getTeamStatus(homeTeamId)).toBe('READY');

  // Invite by Steam ID
  await homeCaptain.page.goto(`/teams/${homeTeamId}/edit`);
  await homeCaptain.page.getByRole('button', { name: 'Invite Players' }).click();
  await homeCaptain.page.locator('#steamId').fill(E2E_USERS.homeInvitee.steamId);
  await Promise.all([
    homeCaptain.page.waitForLoadState('networkidle'),
    homeCaptain.page.getByRole('button', { name: 'Send Invitation' }).click(),
  ]);

  // Invitee accepts from /invitations
  await homeInvitee.page.goto('/invitations');
  await expect(homeInvitee.page.getByText(HOME_TEAM_NAME)).toBeVisible();
  await Promise.all([
    homeInvitee.page.waitForLoadState('networkidle'),
    homeInvitee.page.getByRole('button', { name: 'Accept' }).click(),
  ]);

  // Admin approves invitee
  await admin.page.goto('/admin/pending-players');
  await expect(admin.page.getByText(E2E_USERS.homeInvitee.username)).toBeVisible({
    timeout: 15_000,
  });
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: '✓ Approve' }).click(),
  ]);
  await expect(admin.page.getByText('No pending player requests')).toBeVisible({
    timeout: 15_000,
  });

  // Promote teammate → Demote → Captain Remove invitee
  await homeCaptain.page.goto(`/teams/${homeTeamId}/edit`);
  await homeCaptain.page.getByRole('button', { name: /Roster/ }).click();
  await Promise.all([
    homeCaptain.page.waitForLoadState('networkidle'),
    homeCaptain.page.getByRole('button', { name: 'Promote' }).first().click(),
  ]);
  await Promise.all([
    homeCaptain.page.waitForLoadState('networkidle'),
    homeCaptain.page.getByRole('button', { name: 'Demote' }).first().click(),
  ]);
  await captainRemovePlayer(homeCaptain.page, E2E_USERS.homeInvitee.username);

  // Invite-link join
  await homeCaptain.page.goto(`/teams/${homeTeamId}/edit`);
  const inviteUrl = await readInviteLink(homeCaptain.page);
  await acceptInviteLink(homeLinkJoiner.page, inviteUrl);
  await admin.page.goto('/admin/pending-players');
  await expect(admin.page.getByText(E2E_USERS.homeLinkJoiner.username)).toBeVisible({
    timeout: 15_000,
  });
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: '✓ Approve' }).click(),
  ]);
  await expect(admin.page.getByText('No pending player requests')).toBeVisible({
    timeout: 15_000,
  });

  // Free a roster slot (captain removes link joiner) then steam-invite decline + cancel
  await homeCaptain.page.goto(`/teams/${homeTeamId}/edit`);
  await homeCaptain.page.getByRole('button', { name: /Roster/ }).click();
  await captainRemovePlayer(homeCaptain.page, E2E_USERS.homeLinkJoiner.username);

  await homeCaptain.page.goto(`/teams/${homeTeamId}/edit`);
  await homeCaptain.page.getByRole('button', { name: 'Invite Players' }).click();
  await homeCaptain.page.locator('#steamId').fill(E2E_USERS.homeInviteDecliner.steamId);
  await Promise.all([
    homeCaptain.page.waitForLoadState('networkidle'),
    homeCaptain.page.getByRole('button', { name: 'Send Invitation' }).click(),
  ]);
  await declineSteamInvitation(homeInviteDecliner.page, HOME_TEAM_NAME);

  // Invite declined user for cancel-invite coverage
  await homeCaptain.page.goto(`/teams/${homeTeamId}/edit`);
  await homeCaptain.page.getByRole('button', { name: 'Invite Players' }).click();
  await homeCaptain.page.locator('#steamId').fill(E2E_USERS.homeDeclined.steamId);
  await Promise.all([
    homeCaptain.page.waitForLoadState('networkidle'),
    homeCaptain.page.getByRole('button', { name: 'Send Invitation' }).click(),
  ]);
  await cancelPendingInvite(homeCaptain.page, E2E_USERS.homeDeclined.username);

  // Captain has notifications from join/ready activity
  expect(await countNotifications(E2E_USERS.homeCaptain.steamId)).toBeGreaterThan(0);
  await homeCaptain.page.goto(`/users/${E2E_USERS.homeCaptain.steamId}/notifications`);
  await expect(homeCaptain.page.getByRole('button', { name: 'Mark all as read' })).toBeVisible();
  await Promise.all([
    homeCaptain.page.waitForLoadState('networkidle'),
    homeCaptain.page.getByRole('button', { name: 'Mark all as read' }).click(),
  ]);
});

test('admin creates week match; chat, deny/accept reschedule, edit schedule/arenas, scores, dispute, demo report', async () => {
  test.setTimeout(300_000);

  await adminCreateWeekMatch(admin.page, league, {
    weekNo: 1,
    boSeries: 1,
    arenaId: league.arenaIds[0],
  });
  weekMatchId = await getLatestMatchId({ weekNo: 1 });

  await homeCaptain.page.goto(`/matches/${weekMatchId}`);
  await expect(homeCaptain.page.getByText('Match Communications')).toBeVisible();
  await postMatchMessage(homeCaptain.page, 'E2E: looking forward to the match');

  // Deny then re-request and accept
  const proposed1 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  await requestReschedule(homeCaptain.page, proposed1);
  await awayCaptain.page.goto(`/matches/${weekMatchId}`);
  await expect(awayCaptain.page.getByText('Reschedule Request Pending')).toBeVisible();
  await denyReschedule(awayCaptain.page);

  await homeCaptain.page.goto(`/matches/${weekMatchId}`);
  const proposed2 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  await requestReschedule(homeCaptain.page, proposed2);
  await awayCaptain.page.goto(`/matches/${weekMatchId}`);
  await acceptReschedule(awayCaptain.page);

  // Admin edit schedule + arenas
  const scheduleAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  await admin.page.goto(`/matches/${weekMatchId}`);
  await adminEditSchedule(admin.page, scheduleAt);
  await admin.page.goto(`/matches/${weekMatchId}`);
  await adminEditArenas(admin.page, 'Product');

  // Scores → dispute → resolve via disputes panel
  await homeCaptain.page.goto(`/matches/${weekMatchId}`);
  await expect(homeCaptain.page.getByText('Submit Match Scores')).toBeVisible();
  await submitBo1Scores(homeCaptain.page, { homeScore: 8, awayScore: 2 });
  await expect(homeCaptain.page.getByText('Played', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  expect(await getMatchStatus(weekMatchId)).toBe('PLAYED');

  await awayCaptain.page.goto(`/matches/${weekMatchId}`);
  await fileDispute(awayCaptain.page, 'E2E: scores look wrong, please review demos');
  expect(await getMatchStatus(weekMatchId)).toBe('DISPUTE');

  await adminResolveDisputePanel(admin.page);
  await expect(admin.page.getByText('No Disputed Matches')).toBeVisible({ timeout: 15_000 });
  expect(await getMatchStatus(weekMatchId)).toBe('PLAYED');

  // Seed demo (skips R2), report via UI, admin triage
  await seedDemo({
    matchId: weekMatchId,
    playerSteamId: E2E_USERS.homeCaptain.steamId,
    submittedBy: E2E_USERS.homeCaptain.steamId,
  });
  await awayCaptain.page.goto(`/matches/${weekMatchId}`);
  await reportDemoOnMatch(awayCaptain.page, 'E2E: suspicious movement, please review');
  expect(await countDemoReports('REVIEW')).toBeGreaterThanOrEqual(1);
  await adminResolveDemoReport(admin.page, 'ACTION', 'E2E reviewed — no action needed beyond note');
  expect(await countDemoReports('ACTION')).toBeGreaterThanOrEqual(1);

  // Standings reflect a decided week match (pairing may swap home/away)
  const homeWins = await getTeamWins(homeTeamId);
  const awayWins = await getTeamWins(awayTeamId);
  expect(homeWins + awayWins).toBeGreaterThanOrEqual(1);
  await homeCaptain.page.goto('/leagues/2v2');
  await homeCaptain.page.getByRole('button', { name: 'Standings' }).click();
  await expect(homeCaptain.page.getByText(HOME_TEAM_NAME)).toBeVisible();
  await expect(homeCaptain.page.getByText(AWAY_TEAM_NAME)).toBeVisible();
});

test('admin creates playoff; map bans; Bo3 scores', async () => {
  test.setTimeout(300_000);

  await adminCreatePlayoffMatch(admin.page, league, {
    homeTeamId,
    awayTeamId,
    boSeries: 3,
  });
  playoffMatchId = await getLatestMatchId({ playoff: true });
  const playoffTeams = await getMatchTeams(playoffMatchId);
  const matchHomeCaptain = playoffTeams.homeTeamId === homeTeamId ? homeCaptain : awayCaptain;
  const matchAwayCaptain = playoffTeams.awayTeamId === awayTeamId ? awayCaptain : homeCaptain;

  // Bo3: Away ban, Home ban, Home pick, Away pick, Away ban, Home pick
  const actions: { who: Session; map: string; action: 'ban' | 'pick' }[] = [
    { who: matchAwayCaptain, map: 'Process', action: 'ban' },
    { who: matchHomeCaptain, map: 'Product', action: 'ban' },
    { who: matchHomeCaptain, map: 'Playoff', action: 'pick' },
    { who: matchAwayCaptain, map: 'Clearing', action: 'pick' },
    { who: matchAwayCaptain, map: 'Sunshine', action: 'ban' },
    { who: matchHomeCaptain, map: 'Snakewater', action: 'pick' },
  ];

  for (const step of actions) {
    await step.who.page.goto(`/matches/${playoffMatchId}`);
    await banOrPickMap(step.who.page, step.map, step.action);
  }
  expect(await getMapBanComplete(playoffMatchId)).toBe(true);

  await awayCaptain.page.goto(`/matches/${playoffMatchId}`);
  await expect(awayCaptain.page.getByText('Submit Match Scores')).toBeVisible();
  await submitSeriesScores(awayCaptain.page, [
    { homeScore: 8, awayScore: 2 },
    { homeScore: 8, awayScore: 4 },
  ]);
  await expect(awayCaptain.page.getByText('Played', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  expect(await getMatchStatus(playoffMatchId)).toBe('PLAYED');

  await homeTeammate.page.goto(`/matches/${playoffMatchId}`);
  await expect(homeTeammate.page.getByText('Played', { exact: true })).toBeVisible();
  await awayTeammate.page.goto(`/matches/${weekMatchId}`);
  await expect(awayTeammate.page.getByText('Played', { exact: true })).toBeVisible();
});

test('paid mark-as-paid; 1v1; ban/clear; announcement; league CMS; browse smoke', async () => {
  test.setTimeout(360_000);

  // --- Paid division: admin marks unpaid players as paid ---
  expect(await getPlayerPaymentStatus(paidTeamId, E2E_USERS.paidCaptain.steamId)).toBe(0);
  await admin.page.goto(`/teams/${paidTeamId}`);
  await expect(admin.page.getByText(PAID_TEAM_NAME)).toBeVisible();
  await expect(admin.page.getByText('Mark Player as Paid')).toBeVisible();
  await adminMarkPlayerPaid(admin.page, E2E_USERS.paidCaptain.username);
  expect(await getPlayerPaymentStatus(paidTeamId, E2E_USERS.paidCaptain.steamId)).toBe(1);
  await admin.page.goto(`/teams/${paidTeamId}`);
  await adminMarkPlayerPaid(admin.page, E2E_USERS.paidTeammate.username);
  expect(await getPlayerPaymentStatus(paidTeamId, E2E_USERS.paidTeammate.steamId)).toBe(1);

  // --- 1v1 lifecycle ---
  await solo1v1.page.goto('/signup/1v1');
  await expect(solo1v1.page.getByRole('heading', { name: '1v1 League Signup' })).toBeVisible();
  await solo1v1.page.locator('#regionId').selectOption(String(league.regionId));
  await expect(
    solo1v1.page.locator('#divisionId option').filter({ hasText: 'Invite' }),
  ).toHaveCount(1, { timeout: 10_000 });
  await solo1v1.page.locator('#divisionId').selectOption(String(league.divisionId));
  await solo1v1.page.locator('input[name="rules"]').check();
  await Promise.all([
    solo1v1.page.waitForURL(new RegExp(`/users/${E2E_USERS.solo1v1.steamId}`)),
    solo1v1.page.getByRole('button', { name: 'Sign Up for 1v1 League' }).click(),
  ]);

  await solo1v1.page.goto(`/users/${E2E_USERS.solo1v1.steamId}`);
  await expect(solo1v1.page.getByText('1v1 Management')).toBeVisible();
  await solo1v1.page.getByRole('button', { name: 'Ready Up' }).first().click();
  await expect(solo1v1.page.getByText(/Mark your 1v1 entry as ready/i)).toBeVisible();
  await Promise.all([
    solo1v1.page.waitForLoadState('networkidle'),
    solo1v1.page.getByRole('button', { name: 'Ready Up' }).nth(1).click(),
  ]);

  await admin.page.goto(`/users/${E2E_USERS.solo1v1.steamId}`);
  await admin.page.locator('#admin-1v1-status').selectOption('READY');
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: 'Update Status' }).click(),
  ]);

  await solo1v1.page.goto(`/users/${E2E_USERS.solo1v1.steamId}`);
  await solo1v1.page.getByRole('button', { name: 'Withdraw from League' }).click();
  await expect(
    solo1v1.page.getByRole('heading', { name: 'Withdraw from 1v1 League' }),
  ).toBeVisible();
  await Promise.all([
    solo1v1.page.waitForLoadState('networkidle'),
    solo1v1.page.getByRole('button', { name: 'Withdraw', exact: true }).click(),
  ]);

  await solo1v1.page.goto('/leagues/1v1');
  await expect(solo1v1.page.getByRole('heading', { level: 1 })).toBeVisible();

  // --- Ban / clear on invitee ---
  await admin.page.goto(`/users/${E2E_USERS.homeInvitee.steamId}`);
  await admin.page.getByText('Status:').click();
  await admin.page.locator('#punish-severity').selectOption('SUSPENDED');
  await admin.page.locator('#punish-duration').fill('7');
  await admin.page.locator('#punish-reason').fill('E2E suspension test');
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: 'Apply Punishment' }).click(),
  ]);
  expect(await getUserBanStatus(E2E_USERS.homeInvitee.steamId)).toBe('SUSPENDED');

  await admin.page.goto(`/users/${E2E_USERS.homeInvitee.steamId}`);
  await admin.page.getByText('Status:').click();
  await admin.page.locator('#punish-severity').selectOption('NONE');
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: 'Clear Punishment' }).click(),
  ]);
  expect(await getUserBanStatus(E2E_USERS.homeInvitee.steamId)).toBe('NONE');

  // --- Announcement (created hidden; Show makes it public) ---
  await admin.page.goto('/admin/global');
  await admin.page.locator('#content').fill(ANNOUNCEMENT);
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: 'Create Announcement' }).click(),
  ]);
  await expect(admin.page.getByText(ANNOUNCEMENT)).toBeVisible();
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: 'Show' }).click(),
  ]);
  await expect(admin.page.getByRole('button', { name: 'Hide' })).toBeVisible({ timeout: 15_000 });

  await homeCaptain.page.goto('/');
  await expect(homeCaptain.page.getByText(ANNOUNCEMENT)).toBeVisible();

  // --- Admin league CMS creates (region / division / arena / season) ---
  await adminCreateLeagueRegion(admin.page, UI_REGION);
  await adminCreateLeagueDivision(admin.page, {
    name: UI_DIVISION,
    regionLabel: UI_REGION,
    signupCost: '5',
  });
  await adminCreateLeagueArena(admin.page, UI_ARENA);
  await adminCreateLeagueSeason(admin.page, {
    seasonNum: 2,
    regionLabel: 'E2E Region',
    formatLabel: '2v2',
    numWeeks: 4,
  });

  // --- Browse smoke ---
  for (const [session, path, check] of [
    [homeCaptain, '/signup', 'League Signups'],
    [homeCaptain, '/teams', 'Teams'],
    [homeCaptain, '/users', 'Users'],
    [homeCaptain, '/rulebook', 'Rulebook'],
    [homeCaptain, '/leaderboard', 'Leaderboard'],
    [homeCaptain, '/servers', 'Servers'],
    [homeCaptain, '/logs', 'Match Logs'],
    [homeCaptain, '/maps', 'Maps'],
    [homeCaptain, '/tournaments', 'Tournaments'],
    [admin, '/admin/audit-logs', 'Audit Logs'],
    [admin, '/admin/matches', 'Matches'],
    [admin, '/admin/teams', 'Teams'],
    [admin, '/admin/league', 'League'],
    [admin, '/admin/demos', 'Demo'],
    [admin, '/admin/disputes', 'Dispute'],
  ] as const) {
    await session.page.goto(path);
    await expect(session.page.getByText(new RegExp(check, 'i')).first()).toBeVisible({
      timeout: 15_000,
    });
  }

  // Audit log should show recent mutations
  await admin.page.goto('/admin/audit-logs');
  await expect(admin.page.getByText(/MATCH|TEAM|ROSTER|ADMIN|PAYMENT/i).first()).toBeVisible();
});
