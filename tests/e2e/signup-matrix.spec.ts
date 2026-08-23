import { test, expect } from '@playwright/test';
import { loginAs, selectControlled } from './helpers/auth';
import { resetDatabase } from './helpers/season';
import {
  seedSignupMatrix,
  loadLiveSignupMatrix,
  getCreatedSignupTeam,
  cleanupSignupMatrixTeams,
  teamNameForCell,
  JOIN_PASSWORD,
  isIndividualFormatCode,
  type SignupMatrix,
} from './helpers/signupMatrix';

/**
 * Every open region × format signup path.
 *
 * Locally: seeds 6 regions × 1v1/2v2/ultiduo/bball and submits each combo.
 * Against staging: set PLAYWRIGHT_BASE_URL=https://dev.mge.tf and DATABASE_URL
 * to the staging public URL — reads live open seasons and does not wipe the DB.
 */
test.describe.configure({ mode: 'serial' });

const againstStaging = Boolean(process.env.PLAYWRIGHT_BASE_URL?.includes('dev.mge.tf'));

let matrix: SignupMatrix;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5433/mgetf_test';

  if (againstStaging) {
    matrix = await loadLiveSignupMatrix();
    await cleanupSignupMatrixTeams(matrix.cells.map((c) => c.user.steamId));
  } else {
    await resetDatabase();
    matrix = await seedSignupMatrix();
  }

  expect(matrix.cells.length).toBeGreaterThan(0);
});

test.afterAll(async () => {
  if (againstStaging && matrix) {
    await cleanupSignupMatrixTeams(matrix.cells.map((c) => c.user.steamId));
  }
});

test('hub lists every open format', async ({ browser }) => {
  const first = matrix.cells[0];
  const session = await loginAs(browser, {
    steamId: first.user.steamId,
    username: first.user.username,
    role: againstStaging ? 'ADMIN' : 'GUEST',
    redirect: '/signup',
  });

  await expect(session.page.getByRole('heading', { name: 'League Signups' })).toBeVisible();

  for (const format of matrix.formats) {
    await expect(session.page.getByRole('heading', { name: format.name, exact: true })).toBeVisible();
  }

  await session.context.close();
});

test('sign up every region × format combination', async ({ browser }) => {
  test.setTimeout(600_000);

  for (const cell of matrix.cells) {
    console.log(`signup ${cell.format.code} / ${cell.region.name}`);
    const session = await loginAs(browser, {
      steamId: cell.user.steamId,
      username: cell.user.username,
      role: againstStaging ? 'ADMIN' : 'GUEST',
    });

    try {
      if (isIndividualFormatCode(cell.format.code)) {
        await session.page.goto(`/signup/${cell.format.code}`);
        await expect(
          session.page.getByRole('heading', { name: `${cell.format.name} League Signup` }),
        ).toBeVisible();
        await expect(session.page.locator('#regionId')).toBeEnabled();
        await expect(
          session.page.locator('#regionId option').filter({ hasText: cell.region.name }),
        ).toHaveCount(1, { timeout: 10_000 });
        await selectControlled(session.page, '#regionId', { label: cell.region.name });
        await expect(session.page).toHaveURL(new RegExp(`/signup/${cell.format.code}`));
        await expect(
          session.page.locator('#divisionId option').filter({ hasNotText: /Select/ }),
        ).not.toHaveCount(0, { timeout: 10_000 });
        await selectControlled(session.page, '#divisionId', {
          value: String(cell.region.divisionId),
        });
        await session.page.locator('input[name="rules"]').check();
        await Promise.all([
          session.page.waitForURL(new RegExp(`/users/${cell.user.steamId}`), { timeout: 30_000 }),
          session.page.getByRole('button', { name: /Sign Up for/ }).click(),
        ]);
      } else {
        const teamName = teamNameForCell(cell);
        await session.page.goto(`/signup/${cell.format.code}/create`);
        await expect(session.page.getByRole('heading', { name: /Create New/ })).toBeVisible();
        await session.page.locator('#name').fill(teamName);
        await session.page.locator('#acronym').fill(cell.format.code.slice(0, 4).toUpperCase());
        await expect(session.page.locator('#regionId')).toBeEnabled();
        await expect(
          session.page.locator('#regionId option').filter({ hasText: cell.region.name }),
        ).toHaveCount(1, { timeout: 10_000 });
        await selectControlled(session.page, '#regionId', { label: cell.region.name });
        await expect(session.page).toHaveURL(new RegExp(`/signup/${cell.format.code}/create`));
        await expect(
          session.page.locator('#divisionId option').filter({ hasNotText: /Select/ }),
        ).not.toHaveCount(0, { timeout: 10_000 });
        await selectControlled(session.page, '#divisionId', {
          value: String(cell.region.divisionId),
        });
        await session.page.locator('#joinPassword').fill(JOIN_PASSWORD);
        await session.page.locator('input[name="rules"]').check();
        await Promise.all([
          session.page.waitForURL(/\/teams\/\d+/, { timeout: 30_000 }),
          session.page.getByRole('button', { name: /^Create/ }).click(),
        ]);
      }

      const created = await getCreatedSignupTeam({
        formatId: cell.format.id,
        regionId: cell.region.id,
        ownerSteamId: cell.user.steamId,
      });
      expect(
        created,
        `${cell.format.code} / ${cell.region.name} did not create a team`,
      ).not.toBeNull();
      expect(created!.formatId).toBe(cell.format.id);
      expect(created!.regionId).toBe(cell.region.id);
      expect(created!.status).toBe('UNREADY');
    } finally {
      await session.context.close();
    }
  }
});
