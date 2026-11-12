import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import {
  E2E_USERS,
  resetDatabase,
  seedLeagueInfrastructure,
  seedUsers,
  seedReadyTeam,
} from './helpers/season';
import { PrismaClient } from '../../prisma/generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

test('trace promote/demote/remove interleaving', async ({ browser }) => {
  test.setTimeout(120_000);
  process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5432/mgetf_test';

  await resetDatabase();
  await seedUsers();
  const league = await seedLeagueInfrastructure();
  const teamId = await seedReadyTeam({
    name: 'Alpha Force',
    acronym: 'ALP',
    captainSteamId: E2E_USERS.homeCaptain.steamId,
    teammateSteamId: E2E_USERS.homeTeammate.steamId,
    regionId: league.regionId,
    divisionId: league.divisionId,
    seasonId: league.seasonId,
    status: 'READY',
  });
  {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.playerInTeam.create({
      data: {
        playerSteamId: E2E_USERS.homeInvitee.steamId,
        teamId,
        permissionLevel: 0,
        paymentStatus: 2,
        active: 1,
      },
    });
    await prisma.$disconnect();
  }

  const { page } = await loginAs(browser, {
    steamId: E2E_USERS.homeCaptain.steamId,
    username: E2E_USERS.homeCaptain.username,
    redirect: `/teams/${teamId}`,
  });
  await expect(page.getByRole('heading', { name: 'Alpha Force' })).toBeVisible();

  const t0 = Date.now();
  const stamp = (m: string) => console.log(`[+${Date.now() - t0}ms] ${m}`);
  page.on('response', (r) => {
    if (r.request().method() === 'POST' && r.url().includes('?/')) {
      stamp(`POST ${r.url().split('?/')[1]} -> ${r.status()}`);
    }
  });

  await page.getByRole('tab', { name: 'Management' }).click();
  await page.getByRole('tab', { name: /Roster/ }).click();

  stamp('before promote waitForLoadState+click');
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Promote' }).first().click(),
  ]);
  stamp('promote Promise.all resolved');
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Demote' }).first().click(),
  ]);
  stamp('demote Promise.all resolved');

  const row = page
    .getByTestId('roster-player-row')
    .filter({ hasText: E2E_USERS.homeInvitee.username })
    .first();
  await row.getByRole('button', { name: 'Remove' }).click();
  stamp('remove clicked');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Remove Player' })).toBeVisible();
  stamp('dialog visible');

  for (let i = 0; i < 10; i++) {
    const v = await page.$eval(
      'form[action="?/removePlayer"] input[name="playerSteamId"]',
      (el) => (el as HTMLInputElement).value,
    );
    const d = await page.getByRole('dialog').count();
    stamp(`poll ${i}: input=${JSON.stringify(v)} dialogs=${d}`);
    if (v !== '') break;
    await page.waitForTimeout(200);
  }
});
