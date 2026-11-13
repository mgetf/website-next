import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginAs, fillControlled } from './helpers/auth';
import { E2E_USERS, resetDatabase, seedUsers, seedLeagueInfrastructure } from './helpers/season';
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

async function getFlags(steamId: string) {
  const prisma = createPrisma();
  try {
    return await prisma.playerFlag.findMany({
      where: { playerSteamId: steamId },
      orderBy: { id: 'asc' },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Mod-only player flags: staff notes on a player, listed on a dedicated admin
 * tab with edit/resolve, mirrored on the profile in a mods-only section, and
 * fully written to the audit log.
 */
test.describe.configure({ mode: 'serial' });

let moderator: { context: BrowserContext; page: Page };

test.afterAll(async () => {
  await moderator?.context.close();
});

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5433/mgetf_test';

  await resetDatabase();
  await seedUsers();
  await seedLeagueInfrastructure();

  moderator = await loginAs(browser, {
    steamId: E2E_USERS.homeTeammate.steamId,
    username: E2E_USERS.homeTeammate.username,
    role: 'MODERATOR',
    redirect: '/admin/flags',
  });
});

test('a moderator can add, edit and resolve a flag with audit trail', async () => {
  const page = moderator.page;
  const target = E2E_USERS.awayCaptain.steamId;

  await page.goto('/admin/flags');
  await expect(page.getByRole('heading', { name: 'Player Flags' })).toBeVisible();

  await fillControlled(page, 'input[name="playerSteamId"]', target);
  await fillControlled(page, '#flag-body', 'suspicious, needs to submit demo, 1st strike');
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Add Flag', exact: true }).click(),
  ]);
  await expect(page.getByText('suspicious, needs to submit demo').first()).toBeVisible();

  let flags = await getFlags(target);
  expect(flags).toHaveLength(1);
  expect(flags[0].body).toContain('1st strike');
  expect(flags[0].resolvedAt).toBeNull();

  // Edit via the dialog.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByText('Edit flag')).toBeVisible();
  await fillControlled(page, '#flag-edit-body', 'suspicious, demo requested, 1st strike');
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  flags = await getFlags(target);
  expect(flags[0].body).toContain('demo requested');

  // Resolve via confirm dialog.
  await page.getByRole('button', { name: 'Resolve', exact: true }).first().click();
  await expect(page.getByText('Resolve flag for', { exact: false })).toBeVisible();
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Resolve', exact: true }).last().click(),
  ]);
  flags = await getFlags(target);
  expect(flags[0].resolvedAt).not.toBeNull();
  await expect(page.getByText('Resolved flags (1)')).toBeVisible();

  // Audit trail recorded all three steps.
  const prisma = createPrisma();
  try {
    const logs = await prisma.auditLog.findMany({
      where: { targetType: 'User', targetId: target },
      orderBy: { id: 'asc' },
      select: { action: true },
    });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('USER_FLAGGED');
    expect(actions).toContain('USER_FLAG_UPDATED');
    expect(actions).toContain('USER_FLAG_RESOLVED');
  } finally {
    await prisma.$disconnect();
  }
});

test('flags show in a mods-only profile section, hidden from others', async ({ browser }) => {
  const target = E2E_USERS.awayCaptain.steamId;

  await moderator.page.goto(`/users/${target}`);
  await moderator.page.getByRole('button', { name: /staff tools/i }).click();
  await expect(moderator.page.getByText('Staff flags')).toBeVisible();
  await expect(moderator.page.getByText('MODS ONLY', { exact: false }).first()).toBeVisible();
  await expect(moderator.page.getByText('demo requested')).toBeVisible();

  const outsider = await loginAs(browser, {
    steamId: E2E_USERS.homeInvitee.steamId,
    username: E2E_USERS.homeInvitee.username,
    role: 'GUEST',
    redirect: `/users/${target}`,
  });
  await expect(outsider.page.getByText('Staff flags')).toHaveCount(0);
  await expect(outsider.page.getByText('demo requested')).toHaveCount(0);
  await expect(outsider.page.getByText('MODS ONLY')).toHaveCount(0);
  await outsider.context.close();
});
