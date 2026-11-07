import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginAs, adminCreateWeekMatch, fillControlled } from './helpers/auth';
import {
  E2E_USERS,
  resetDatabase,
  seedLeagueInfrastructure,
  seedUsers,
  seedReadyTeam,
  getLatestMatchId,
  getMatchStatus,
  getTeamWins,
  getTeamByName,
  type SeasonSeed,
} from './helpers/season';

/**
 * Moderators (and admins) can reset a played match to UNPLAYED so it can be
 * rerun. The reset reverses the team standings the result added.
 */
test.describe.configure({ mode: 'serial' });

const JOIN_PASSWORD = 'join-pass-123';
const HOME = 'Reset Home Team';
const AWAY = 'Reset Away Team';

let league: SeasonSeed;
let matchId: number;
let moderator: { context: BrowserContext; page: Page };
let admin: { context: BrowserContext; page: Page };

test.afterAll(async () => {
  await moderator?.context.close();
  await admin?.context.close();
});

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5433/mgetf_test';

  await resetDatabase();
  await seedUsers();
  league = await seedLeagueInfrastructure();

  await seedReadyTeam({
    name: HOME,
    acronym: 'RHT',
    captainSteamId: E2E_USERS.homeCaptain.steamId,
    teammateSteamId: E2E_USERS.homeTeammate.steamId,
    regionId: league.regionId,
    divisionId: league.divisionId,
    seasonId: league.seasonId,
    joinPassword: JOIN_PASSWORD,
  });
  await seedReadyTeam({
    name: AWAY,
    acronym: 'RAT',
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
  await adminCreateWeekMatch(admin.page, league, { weekNo: 1, boSeries: 1 });
  matchId = await getLatestMatchId({ weekNo: 1 });

  // Record a played result through the admin score override, which writes team standings.
  await admin.page.goto(`/matches/${matchId}`);
  await admin.page.getByRole('button', { name: 'Edit Scores' }).click();
  await expect(admin.page.getByText('Edit Match Scores')).toBeVisible();
  await fillControlled(admin.page, '#adminHomeScore-0', '8');
  await fillControlled(admin.page, '#adminAwayScore-0', '2');
  await Promise.all([
    admin.page.waitForLoadState('networkidle'),
    admin.page.getByRole('button', { name: 'Save Scores' }).click(),
  ]);
  await expect(admin.page.getByText('Played', { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await getMatchStatus(matchId)).toBe('PLAYED');

  moderator = await loginAs(browser, {
    steamId: E2E_USERS.homeTeammate.steamId,
    username: E2E_USERS.homeTeammate.username,
    role: 'MODERATOR',
    redirect: `/matches/${matchId}`,
  });
});

test('a moderator can mark a played match as unplayed and standings reverse', async () => {
  const page = moderator.page;
  const homeId = (await getTeamByName(HOME)).id;
  expect(await getTeamWins(homeId)).toBe(1);

  await page.goto(`/matches/${matchId}`);
  await page.getByRole('button', { name: 'Mark as Unplayed (Rerun)' }).click();
  await expect(page.getByRole('heading', { name: 'Mark Match as Unplayed' })).toBeVisible();

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Mark as Unplayed', exact: true }).click(),
  ]);

  await expect.poll(() => getMatchStatus(matchId), { timeout: 15_000 }).toBe('UNPLAYED');
  expect(await getTeamWins(homeId)).toBe(0);
  await expect(page.getByText('Match Communications')).toBeVisible();
});

test('the reset control is hidden once the match is unplayed', async () => {
  await moderator.page.goto(`/matches/${matchId}`);
  await expect(moderator.page.getByRole('button', { name: 'Delete Match' })).toBeVisible();
  await expect(
    moderator.page.getByRole('button', { name: 'Mark as Unplayed (Rerun)' }),
  ).toHaveCount(0);
});
