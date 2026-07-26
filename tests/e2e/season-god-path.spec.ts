import { test, expect } from '@playwright/test';
import { loginAs, submitBo1Scores } from './helpers/auth';
import {
  E2E_USERS,
  resetDatabase,
  seedLeagueInfrastructure,
  seedUsers,
  seedReadyTeam,
  createRegularMatch,
  createPlayoffFinal,
  getMatchStatus,
  type SeasonSeed,
} from './helpers/season';

/**
 * God test: shortest complete 2v2 season that still hits playoffs.
 *
 * Shape (refined from "4 browsers + full multi-week season"):
 * - 5 browser contexts: admin + 2 captains + 2 teammates (proves roster size)
 * - League infrastructure seeded via Prisma (formats/region/division/season/playoff)
 * - Teams seeded READY (join/approve covered by unit/service tests elsewhere)
 * - 1 regular-season Bo1 match → scores via captain UI
 * - 1 playoff final Bo1 → scores via opposing captain UI
 * - Assert both matches PLAYED
 *
 * Auth uses /auth/test-login (disabled in production).
 */
test.describe.configure({ mode: 'serial' });

test('2v2 season god path: week match then playoff final', async ({ browser }) => {
  test.setTimeout(240_000);

  process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5432/mgetf_test';

  await resetDatabase();
  await seedUsers();
  const league: SeasonSeed = await seedLeagueInfrastructure();

  const homeTeamId = await seedReadyTeam({
    name: 'Alpha Force',
    acronym: 'ALP',
    captainSteamId: E2E_USERS.homeCaptain.steamId,
    teammateSteamId: E2E_USERS.homeTeammate.steamId,
    regionId: league.regionId,
    divisionId: league.divisionId,
    seasonId: league.seasonId,
  });

  const awayTeamId = await seedReadyTeam({
    name: 'Bravo Unit',
    acronym: 'BRA',
    captainSteamId: E2E_USERS.awayCaptain.steamId,
    teammateSteamId: E2E_USERS.awayTeammate.steamId,
    regionId: league.regionId,
    divisionId: league.divisionId,
    seasonId: league.seasonId,
  });

  // Five contexts — admin observes; both captains + both teammates load team pages
  const admin = await loginAs(browser, {
    steamId: E2E_USERS.admin.steamId,
    username: E2E_USERS.admin.username,
    role: 'ADMIN',
    redirect: '/admin',
  });
  const homeCaptain = await loginAs(browser, {
    steamId: E2E_USERS.homeCaptain.steamId,
    username: E2E_USERS.homeCaptain.username,
    redirect: `/teams/${homeTeamId}`,
  });
  const homeTeammate = await loginAs(browser, {
    steamId: E2E_USERS.homeTeammate.steamId,
    username: E2E_USERS.homeTeammate.username,
    redirect: `/teams/${homeTeamId}`,
  });
  const awayCaptain = await loginAs(browser, {
    steamId: E2E_USERS.awayCaptain.steamId,
    username: E2E_USERS.awayCaptain.username,
    redirect: `/teams/${awayTeamId}`,
  });
  const awayTeammate = await loginAs(browser, {
    steamId: E2E_USERS.awayTeammate.steamId,
    username: E2E_USERS.awayTeammate.username,
    redirect: `/teams/${awayTeamId}`,
  });

  await expect(admin.page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(homeCaptain.page.getByRole('heading', { name: 'Alpha Force' })).toBeVisible();
  await expect(homeTeammate.page.getByRole('heading', { name: 'Alpha Force' })).toBeVisible();
  await expect(awayCaptain.page.getByRole('heading', { name: 'Bravo Unit' })).toBeVisible();
  await expect(awayTeammate.page.getByRole('heading', { name: 'Bravo Unit' })).toBeVisible();

  // --- Regular season week 1 ---
  const weekMatchId = await createRegularMatch({
    homeTeamId,
    awayTeamId,
    seasonId: league.seasonId,
    seasonNum: league.seasonNum,
    weekNo: 1,
    arenaId: league.arenaIds[0],
    boSeries: 1,
  });

  await homeCaptain.page.goto(`/matches/${weekMatchId}`);
  await expect(homeCaptain.page.getByText('Submit Match Scores')).toBeVisible();
  await submitBo1Scores(homeCaptain.page, { homeScore: 8, awayScore: 2 });
  await expect(homeCaptain.page.getByText('Played', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(homeCaptain.page.getByText('Submit Match Scores')).toHaveCount(0);
  expect(await getMatchStatus(weekMatchId)).toBe('PLAYED');

  // Away captain can see the result
  await awayCaptain.page.goto(`/matches/${weekMatchId}`);
  await expect(awayCaptain.page.getByText('Played', { exact: true })).toBeVisible();

  // --- Playoff final ---
  const playoffMatchId = await createPlayoffFinal({
    homeTeamId,
    awayTeamId,
    seasonId: league.seasonId,
    seasonNum: league.seasonNum,
    playoffId: league.playoffId,
    arenaId: league.arenaIds[2],
    boSeries: 1,
  });

  await awayCaptain.page.goto(`/matches/${playoffMatchId}`);
  await expect(awayCaptain.page.getByText('Submit Match Scores')).toBeVisible();
  await submitBo1Scores(awayCaptain.page, { homeScore: 5, awayScore: 8 });
  await expect(awayCaptain.page.getByText('Played', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  expect(await getMatchStatus(playoffMatchId)).toBe('PLAYED');

  // Admin can open both completed matches
  await admin.page.goto(`/matches/${weekMatchId}`);
  await expect(admin.page.getByText('Played', { exact: true })).toBeVisible();
  await admin.page.goto(`/matches/${playoffMatchId}`);
  await expect(admin.page.getByText('Played', { exact: true })).toBeVisible();

  await Promise.all([
    admin.context.close(),
    homeCaptain.context.close(),
    homeTeammate.context.close(),
    awayCaptain.context.close(),
    awayTeammate.context.close(),
  ]);
});
