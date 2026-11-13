import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginAs, adminCreateWeekMatch, fillControlled, selectControlled } from './helpers/auth';
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
import { PrismaClient } from '../../prisma/generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://mgetf:mgetf@localhost:5433/mgetf_test',
    }),
  });
}

async function getMatchForfeit(matchId: number) {
  const prisma = createPrisma();
  try {
    return await prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      select: {
        status: true,
        winnerId: true,
        winnerScore: true,
        loserScore: true,
        forfeitType: true,
        forfeitWinnerId: true,
        forfeitTicketRef: true,
        forfeitReason: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function getTeamStats(teamId: number) {
  const prisma = createPrisma();
  try {
    return await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { wins: true, losses: true, gamesWon: true, gamesLost: true, pointsScored: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function getGameScores(matchId: number) {
  const prisma = createPrisma();
  try {
    const games = await prisma.game.findMany({
      where: { matchId },
      orderBy: { gameNum: 'asc' },
      select: { gameNum: true, homeTeamScore: true, awayTeamScore: true },
    });
    return games;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Mod-approved forfeits: single FF (W/L only, no points), mutual void
 * (no-contest), and revoking scores for rounds that never took place.
 */
test.describe.configure({ mode: 'serial' });

const JOIN_PASSWORD = 'join-pass-123';
const HOME = 'Forfeit Home Team';
const AWAY = 'Forfeit Away Team';

let league: SeasonSeed;
let ffMatchId: number;
let revokeMatchId: number;
let voidMatchId: number;
let homeId: number;
let awayId: number;
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
    acronym: 'FHT',
    captainSteamId: E2E_USERS.homeCaptain.steamId,
    teammateSteamId: E2E_USERS.homeTeammate.steamId,
    regionId: league.regionId,
    divisionId: league.divisionId,
    seasonId: league.seasonId,
    joinPassword: JOIN_PASSWORD,
  });
  await seedReadyTeam({
    name: AWAY,
    acronym: 'FAT',
    captainSteamId: E2E_USERS.awayCaptain.steamId,
    teammateSteamId: E2E_USERS.awayTeammate.steamId,
    regionId: league.regionId,
    divisionId: league.divisionId,
    seasonId: league.seasonId,
    joinPassword: JOIN_PASSWORD,
  });
  homeId = (await getTeamByName(HOME)).id;
  awayId = (await getTeamByName(AWAY)).id;

  admin = await loginAs(browser, {
    steamId: E2E_USERS.admin.steamId,
    username: E2E_USERS.admin.username,
    role: 'ADMIN',
    redirect: '/admin',
  });
  await adminCreateWeekMatch(admin.page, league, { weekNo: 1, boSeries: 1 });
  ffMatchId = await getLatestMatchId({ weekNo: 1 });
  await adminCreateWeekMatch(admin.page, league, { weekNo: 1, boSeries: 3 });
  revokeMatchId = await getLatestMatchId({ weekNo: 1 });
  if (revokeMatchId === ffMatchId) throw new Error('expected a new match row');
  await adminCreateWeekMatch(admin.page, league, { weekNo: 1, boSeries: 1 });
  voidMatchId = await getLatestMatchId({ weekNo: 1 });

  moderator = await loginAs(browser, {
    steamId: E2E_USERS.homeTeammate.steamId,
    username: E2E_USERS.homeTeammate.username,
    role: 'MODERATOR',
    redirect: `/matches/${ffMatchId}`,
  });
});

test('a moderator can record a single forfeit: W/L only, no points', async () => {
  const page = moderator.page;
  await page.goto(`/matches/${ffMatchId}`);
  await page.getByRole('button', { name: 'Record Forfeit' }).click();
  await expect(page.getByText('Record Forfeit Win')).toBeVisible();

  await selectControlled(page, '#winnerTeamId', { label: HOME });
  await fillControlled(page, 'input[name="ticketRef"]', 'closed-0001');
  await fillControlled(page, 'textarea[name="reason"]', 'Opponent no-show. LLM: forfeit (high).');

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Record Forfeit', exact: true }).last().click(),
  ]);
  await expect(page.getByText('Forfeit recorded')).toBeVisible({ timeout: 20_000 });

  const ff = await getMatchForfeit(ffMatchId);
  expect(ff.status).toBe('PLAYED');
  expect(ff.forfeitType).toBe('SINGLE');
  expect(ff.winnerId).toBe(homeId);
  expect(ff.winnerScore).toBe(20);
  expect(ff.forfeitTicketRef).toBe('closed-0001');

  const home = await getTeamStats(homeId);
  const away = await getTeamStats(awayId);
  expect(home.wins).toBe(1);
  expect(away.losses).toBe(1);
  // No games or points counted — excluded from averages.
  expect(home.pointsScored).toBe(0);
  expect(away.pointsScored).toBe(0);
  expect(home.gamesWon).toBe(0);

  await expect(page.getByText('FF', { exact: true })).toBeVisible();
  await expect(page.getByText(`Forfeit win for ${HOME}`, { exact: false })).toBeVisible();
  await expect(page.getByText('Forfeit', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Winner', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Opponent no-show', { exact: false })).toBeVisible();
});

test('forfeit reason is hidden from outsiders', async ({ browser }) => {
  const outsider = await loginAs(browser, {
    steamId: E2E_USERS.homeInvitee.steamId,
    username: E2E_USERS.homeInvitee.username,
    role: 'GUEST',
    redirect: `/matches/${ffMatchId}`,
  });
  await expect(outsider.page.getByText('FF', { exact: true })).toBeVisible();
  await expect(outsider.page.getByText('Opponent no-show', { exact: false })).toHaveCount(0);
  await outsider.context.close();
});

test('a moderator can revoke scores for rounds that never took place', async () => {
  const page = moderator.page;
  // Admin submits two played games first.
  await page.goto(`/matches/${revokeMatchId}`);
  await page.getByRole('button', { name: 'Edit Scores' }).click();
  await fillControlled(page, '#adminHomeScore-0', '20');
  await fillControlled(page, '#adminAwayScore-0', '10');
  await fillControlled(page, '#adminHomeScore-1', '20');
  await fillControlled(page, '#adminAwayScore-1', '5');
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Save Scores' }).click(),
  ]);
  await expect.poll(() => getMatchStatus(revokeMatchId), { timeout: 15_000 }).toBe('PLAYED');

  let home = await getTeamStats(homeId);
  expect(home.wins).toBe(2); // 1 forfeit + 1 played
  expect(home.pointsScored).toBe(40);

  // Game 2 never took place — revoke it.
  await page.goto(`/matches/${revokeMatchId}`);
  await page.getByRole('button', { name: 'Edit Scores' }).click();
  await page.getByText('Revoke rounds that never took place').waitFor();
  await page.locator('form[action="?/revokeGameScores"] input[name="gameNums"][value="2"]').check();
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Revoke selected' }).click(),
  ]);
  await expect(page.getByText(/Scores revoked|is unplayed/)).toBeVisible({ timeout: 20_000 });

  const games = await getGameScores(revokeMatchId);
  expect(games.find((g) => g.gameNum === 2)).toMatchObject({
    homeTeamScore: null,
    awayTeamScore: null,
  });
  expect(await getMatchStatus(revokeMatchId)).toBe('PLAYED');

  home = await getTeamStats(homeId);
  expect(home.wins).toBe(2);
  expect(home.pointsScored).toBe(20);
  expect(home.gamesWon).toBe(1);
});

test('a moderator can void a mutual forfeit with no standings changes', async () => {
  const page = moderator.page;
  const beforeHome = await getTeamStats(homeId);
  const beforeAway = await getTeamStats(awayId);

  await page.goto(`/matches/${voidMatchId}`);
  await page.getByRole('button', { name: 'Void (Mutual FF)' }).click();
  await expect(page.getByText('Void Match (Mutual Forfeit)')).toBeVisible();
  await fillControlled(page, 'input[name="ticketRef"]', 'closed-0002');
  await fillControlled(page, 'textarea[name="reason"]', 'Both teams agreed not to play.');
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Void Match', exact: true }).last().click(),
  ]);
  await expect(page.getByText('Match voided')).toBeVisible({ timeout: 20_000 });

  const ff = await getMatchForfeit(voidMatchId);
  expect(ff.status).toBe('PLAYED');
  expect(ff.forfeitType).toBe('MUTUAL');
  expect(ff.winnerId).toBeNull();

  expect(await getTeamStats(homeId)).toEqual(beforeHome);
  expect(await getTeamStats(awayId)).toEqual(beforeAway);

  await expect(page.getByText('Void', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('no-contest', { exact: false }).first()).toBeVisible();
});
