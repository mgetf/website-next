import { test, expect } from '@playwright/test';
import { loginAs, selectControlled } from './helpers/auth';
import { resetDatabase } from './helpers/season';
import {
  seedSignupMatrix,
  getCreatedSignupTeam,
  teamNameFor,
  JOIN_PASSWORD,
  type SignupMatrix,
  type MatrixFormat,
  type MatrixRegion,
  type MatrixUser,
} from './helpers/signupMatrix';

/**
 * Local signup coverage for every team format plus region filtering.
 * Uses the docker/CI test database only — do not point this at a live site.
 */
test.describe.configure({ mode: 'serial' });

let matrix: SignupMatrix;
let nextUser = 0;

function takeUser(): MatrixUser {
  const user = matrix.users[nextUser];
  if (!user) throw new Error('Not enough seeded signup users');
  nextUser += 1;
  return user;
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5432/mgetf_test';

  await resetDatabase();
  matrix = await seedSignupMatrix();
});

test('hub lists every open format', async ({ browser }) => {
  const user = matrix.users[0];
  const session = await loginAs(browser, {
    steamId: user.steamId,
    username: user.username,
    redirect: '/signup',
  });

  await expect(session.page.getByRole('heading', { name: 'League Signups' })).toBeVisible();
  for (const format of matrix.formats) {
    await expect(
      session.page.getByRole('heading', { name: format.name, exact: true }),
    ).toBeVisible();
  }

  await session.context.close();
});

test('region dropdowns only list regions with an open season for that format', async ({
  browser,
}) => {
  const user = matrix.users[0];
  const session = await loginAs(browser, {
    steamId: user.steamId,
    username: user.username,
  });

  try {
    await session.page.goto('/signup/1v1');
    const oneVOneRegions = session.page
      .locator('#regionId option')
      .filter({ hasNotText: /Select/ });
    await expect(oneVOneRegions).toHaveCount(matrix.allFormatRegions.length);
    await expect(session.page.locator('#regionId option').filter({ hasText: 'EU' })).toHaveCount(0);

    await session.page.goto('/signup/2v2/create');
    const twoVTwoRegions = session.page
      .locator('#regionId option')
      .filter({ hasNotText: /Select/ });
    await expect(twoVTwoRegions).toHaveCount(matrix.allFormatRegions.length + 1);
    await expect(session.page.locator('#regionId option').filter({ hasText: 'EU' })).toHaveCount(1);
  } finally {
    await session.context.close();
  }
});

test('sign up 1v1 and create a team in each team format', async ({ browser }) => {
  test.setTimeout(300_000);

  const region = matrix.allFormatRegions[0];
  for (const format of matrix.formats) {
    const user = takeUser();
    await completeSignup(browser, format, region, user);
  }

  const twoV2 = matrix.formats.find((f) => f.code === '2v2');
  if (!twoV2) throw new Error('2v2 format missing from seed');
  await completeSignup(browser, twoV2, matrix.twoV2OnlyRegion, takeUser());
});

async function completeSignup(
  browser: import('@playwright/test').Browser,
  format: MatrixFormat,
  region: MatrixRegion,
  user: MatrixUser,
): Promise<void> {
  const session = await loginAs(browser, {
    steamId: user.steamId,
    username: user.username,
  });

  try {
    if (format.isIndividual) {
      await session.page.goto(`/signup/${format.code}`);
      await expect(
        session.page.getByRole('heading', { name: `${format.name} League Signup` }),
      ).toBeVisible();
      await selectControlled(session.page, '#regionId', { label: region.name });
      await expect(
        session.page.locator('#divisionId option').filter({ hasNotText: /Select/ }),
      ).not.toHaveCount(0, { timeout: 10_000 });
      await selectControlled(session.page, '#divisionId', { value: String(region.divisionId) });
      await session.page.locator('input[name="rules"]').check();
      await Promise.all([
        session.page.waitForURL(new RegExp(`/users/${user.steamId}`), { timeout: 30_000 }),
        session.page.getByRole('button', { name: /Sign Up for/ }).click(),
      ]);
    } else {
      const teamName = teamNameFor(format.code, region.name);
      await session.page.goto(`/signup/${format.code}/create`);
      await expect(session.page.getByRole('heading', { name: /Create New/ })).toBeVisible();
      await session.page.locator('#name').fill(teamName);
      await session.page.locator('#acronym').fill(format.code.slice(0, 4).toUpperCase());
      await selectControlled(session.page, '#regionId', { label: region.name });
      await expect(
        session.page.locator('#divisionId option').filter({ hasNotText: /Select/ }),
      ).not.toHaveCount(0, { timeout: 10_000 });
      await selectControlled(session.page, '#divisionId', { value: String(region.divisionId) });
      await session.page.locator('#joinPassword').fill(JOIN_PASSWORD);
      await session.page.locator('input[name="rules"]').check();
      await Promise.all([
        session.page.waitForURL(/\/teams\/\d+/, { timeout: 30_000 }),
        session.page.getByRole('button', { name: /^Create/ }).click(),
      ]);
    }

    const created = await getCreatedSignupTeam({
      formatId: format.id,
      regionId: region.id,
      ownerSteamId: user.steamId,
    });
    expect(created, `${format.code} / ${region.name} did not create a team`).not.toBeNull();
    expect(created!.formatId).toBe(format.id);
    expect(created!.regionId).toBe(region.id);
    expect(created!.status).toBe('UNREADY');
  } finally {
    await session.context.close();
  }
}
