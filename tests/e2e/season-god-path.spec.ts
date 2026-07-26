import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  loginAs,
  submitBo1Scores,
  submitSeriesScores,
  postMatchMessage,
  requestReschedule,
  acceptReschedule,
  fileDispute,
  adminResolveDisputeScores,
  banOrPickMap,
} from './helpers/auth';
import {
  E2E_USERS,
  resetDatabase,
  seedLeagueInfrastructure,
  seedUsers,
  seedReadyTeam,
  createRegularMatch,
  createPlayoffFinal,
  getMatchStatus,
  getTeamByName,
  getTeamStatus,
  getMapBanComplete,
  type SeasonSeed,
} from './helpers/season';

/**
 * Full 2v2 season god path — covers signup → join → ready → week match
 * (comms, reschedule, scores, dispute, admin resolve) → playoff map bans → scores.
 *
 * Hybrid: Prisma seeds league infra + away team; UI drives player/admin flows.
 * Five browser contexts: admin + 2 captains + 2 teammates.
 * Auth via /auth/test-login (disabled in production).
 */
test.describe.configure({ mode: 'serial' });

type Session = { context: BrowserContext; page: Page };

let league: SeasonSeed;
let homeTeamId: number;
let awayTeamId: number;
let weekMatchId: number;
let playoffMatchId: number;

let admin: Session;
let homeCaptain: Session;
let homeTeammate: Session;
let awayCaptain: Session;
let awayTeammate: Session;

const JOIN_PASSWORD = 'join-pass-123';
const HOME_TEAM_NAME = 'Alpha Force';
const AWAY_TEAM_NAME = 'Bravo Unit';

async function closeAll() {
  await Promise.all(
    [admin, homeCaptain, homeTeammate, awayCaptain, awayTeammate]
      .filter(Boolean)
      .map((s) => s.context.close()),
  );
}

test.afterAll(async () => {
  await closeAll();
});

test('seed league, create home team via UI, seed away READY', async ({ browser }) => {
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

  await expect(awayCaptain.page.getByRole('heading', { name: AWAY_TEAM_NAME })).toBeVisible();
  await expect(awayTeammate.page.getByRole('heading', { name: AWAY_TEAM_NAME })).toBeVisible();

  // --- Home captain creates team via signup UI ---
  await expect(homeCaptain.page.getByRole('heading', { name: 'Create New Team' })).toBeVisible();
  await homeCaptain.page.locator('#name').fill(HOME_TEAM_NAME);
  await homeCaptain.page.locator('#acronym').fill('ALP');
  await homeCaptain.page.locator('#regionId').selectOption({ label: 'E2E Region' });
  // Division labels include cost suffix, e.g. "Invite - FREE".
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
  await expect(homeCaptain.page.getByRole('heading', { name: HOME_TEAM_NAME })).toBeVisible();
});

test('teammate joins, admin approves, captain ready-up, admin sets READY', async () => {
  test.setTimeout(180_000);

  // Teammate requests join
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

  // Admin approves pending player
  await admin.page.goto('/admin/pending-players');
  await expect(admin.page.getByText(E2E_USERS.homeTeammate.username)).toBeVisible();
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: '✓ Approve' }).click(),
  ]);
  await expect(admin.page.getByText('No pending player requests')).toBeVisible({
    timeout: 15_000,
  });

  // Captain ready-up → PENDING (ConfirmDialog confirm also labeled Ready Up)
  await homeCaptain.page.goto(`/teams/${homeTeamId}`);
  await homeCaptain.page.getByRole('button', { name: 'Ready Up' }).click();
  await expect(homeCaptain.page.getByText('Mark Alpha Force as ready?')).toBeVisible();
  await Promise.all([
    homeCaptain.page.waitForLoadState('networkidle'),
    homeCaptain.page.getByRole('button', { name: 'Ready Up' }).nth(1).click(),
  ]);
  await expect(homeCaptain.page.getByText('Pending Admin Approval')).toBeVisible({
    timeout: 15_000,
  });
  expect(await getTeamStatus(homeTeamId)).toBe('PENDING');

  // Admin sets READY (global admin controls on team page)
  await admin.page.goto(`/teams/${homeTeamId}`);
  await admin.page.locator('#status').selectOption('READY');
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: 'Update Status' }).click(),
  ]);
  expect(await getTeamStatus(homeTeamId)).toBe('READY');

  // Teammate can see ready team
  await homeTeammate.page.goto(`/teams/${homeTeamId}`);
  await expect(homeTeammate.page.getByRole('heading', { name: HOME_TEAM_NAME })).toBeVisible();
});

test('week match: chat, reschedule, scores, dispute, admin resolve', async () => {
  test.setTimeout(240_000);

  weekMatchId = await createRegularMatch({
    homeTeamId,
    awayTeamId,
    seasonId: league.seasonId,
    seasonNum: league.seasonNum,
    weekNo: 1,
    arenaId: league.arenaIds[0],
    boSeries: 1,
  });

  // Home captain posts a message
  await homeCaptain.page.goto(`/matches/${weekMatchId}`);
  await expect(homeCaptain.page.getByText('Match Communications')).toBeVisible();
  await postMatchMessage(homeCaptain.page, 'E2E: looking forward to the match');

  // Home requests reschedule; away accepts
  const proposed = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  await requestReschedule(homeCaptain.page, proposed);

  await awayCaptain.page.goto(`/matches/${weekMatchId}`);
  await expect(awayCaptain.page.getByText('Reschedule Request Pending')).toBeVisible();
  await acceptReschedule(awayCaptain.page);

  // Home submits Bo1 scores
  await homeCaptain.page.goto(`/matches/${weekMatchId}`);
  await expect(homeCaptain.page.getByText('Submit Match Scores')).toBeVisible();
  await submitBo1Scores(homeCaptain.page, { homeScore: 8, awayScore: 2 });
  await expect(homeCaptain.page.getByText('Played', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  expect(await getMatchStatus(weekMatchId)).toBe('PLAYED');

  // Away files dispute
  await awayCaptain.page.goto(`/matches/${weekMatchId}`);
  await expect(awayCaptain.page.getByRole('button', { name: 'File Dispute' })).toBeVisible();
  await fileDispute(awayCaptain.page, 'E2E: scores look wrong, please review demos');
  expect(await getMatchStatus(weekMatchId)).toBe('DISPUTE');

  // Admin resolves dispute via Edit Scores
  await admin.page.goto(`/matches/${weekMatchId}`);
  await expect(admin.page.getByText('Disputed', { exact: true })).toBeVisible();
  await adminResolveDisputeScores(admin.page, { homeScore: 8, awayScore: 3 });
  expect(await getMatchStatus(weekMatchId)).toBe('PLAYED');
});

test('playoff final: map ban/pick phase then Bo3 scores', async () => {
  test.setTimeout(300_000);

  playoffMatchId = await createPlayoffFinal({
    homeTeamId,
    awayTeamId,
    seasonId: league.seasonId,
    seasonNum: league.seasonNum,
    playoffId: league.playoffId,
    mapBanPoolId: league.mapBanPoolId,
    boSeries: 3,
  });

  // Bo3 pattern: Away ban, Home ban, Home pick, Away pick, Away ban, Home pick
  const actions: { who: Session; map: string; action: 'ban' | 'pick' }[] = [
    { who: awayCaptain, map: 'Process', action: 'ban' },
    { who: homeCaptain, map: 'Product', action: 'ban' },
    { who: homeCaptain, map: 'Playoff', action: 'pick' },
    { who: awayCaptain, map: 'Clearing', action: 'pick' },
    { who: awayCaptain, map: 'Sunshine', action: 'ban' },
    { who: homeCaptain, map: 'Snakewater', action: 'pick' },
  ];

  for (const step of actions) {
    await step.who.page.goto(`/matches/${playoffMatchId}`);
    await banOrPickMap(step.who.page, step.map, step.action);
  }

  expect(await getMapBanComplete(playoffMatchId)).toBe(true);

  // Away submits Bo3 scores (home wins 2–0)
  await awayCaptain.page.goto(`/matches/${playoffMatchId}`);
  await expect(awayCaptain.page.getByText('Submit Match Scores')).toBeVisible();
  await expect(awayCaptain.page.getByText('Map Ban/Pick Phase')).toHaveCount(0);
  await submitSeriesScores(awayCaptain.page, [
    { homeScore: 8, awayScore: 2 },
    { homeScore: 8, awayScore: 4 },
  ]);
  await expect(awayCaptain.page.getByText('Played', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  expect(await getMatchStatus(playoffMatchId)).toBe('PLAYED');

  // Admin + both teams can open completed matches
  await admin.page.goto(`/matches/${weekMatchId}`);
  await expect(admin.page.getByText('Played', { exact: true })).toBeVisible();
  await admin.page.goto(`/matches/${playoffMatchId}`);
  await expect(admin.page.getByText('Played', { exact: true })).toBeVisible();

  await homeTeammate.page.goto(`/matches/${playoffMatchId}`);
  await expect(homeTeammate.page.getByText('Played', { exact: true })).toBeVisible();
  await awayTeammate.page.goto(`/matches/${weekMatchId}`);
  await expect(awayTeammate.page.getByText('Played', { exact: true })).toBeVisible();
});
