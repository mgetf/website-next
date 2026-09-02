import { test, expect } from '@playwright/test';
import { selectControlled } from './helpers/auth';
import { resetDatabase } from './helpers/season';
import { resumeSignupAfterLogin, submitSignupAndCaptureReturnTo } from './helpers/signupLoginHop';
import {
  seedSignupMatrix,
  getCreatedSignupTeam,
  JOIN_PASSWORD,
  type SignupMatrix,
} from './helpers/signupMatrix';

/**
 * Guest signup must reach region/division before login, then restore the draft
 * after the Steam hop. Uses the docker/CI test database only.
 */
test.describe.configure({ mode: 'serial' });

let matrix: SignupMatrix;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5432/mgetf_test';

  await resetDatabase();
  matrix = await seedSignupMatrix();
});

test('guest can open signup without being sent to login', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Register Your Team/ })).toHaveAttribute(
    'href',
    '/signup',
  );

  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'League Signups' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Start fresh with a brand new 2v2 team/ }),
  ).toBeVisible();

  await page.goto('/signup/2v2/create');
  await expect(page.getByRole('heading', { name: 'Create New 2v2 Team' })).toBeVisible();
  await expect(page.locator('#regionId')).toBeVisible();
});

test('2v2 create draft survives the login hop and then submits', async ({ page }) => {
  const user = matrix.users[0];
  const region = matrix.allFormatRegions[0];
  const teamName = 'Hop Team NA';
  const acronym = 'HOP';

  await page.goto('/signup/2v2/create');
  await page.locator('#name').fill(teamName);
  await page.locator('#acronym').fill(acronym);
  await selectControlled(page, '#regionId', { label: region.name });
  await expect(page.locator('#divisionId option').filter({ hasNotText: /Select/ })).not.toHaveCount(
    0,
    { timeout: 10_000 },
  );
  await selectControlled(page, '#divisionId', { value: String(region.divisionId) });
  await page.locator('#joinPassword').fill(JOIN_PASSWORD);
  await page.locator('input[name="rules"]').check();

  const returnTo = await submitSignupAndCaptureReturnTo(page, () =>
    page.getByRole('button', { name: /^Create/ }).click(),
  );

  expect(returnTo.startsWith('/signup/2v2/create?')).toBeTruthy();
  const draft = new URL(returnTo, 'http://localhost');
  expect(draft.searchParams.get('regionId')).toBe(String(region.id));
  expect(draft.searchParams.get('divisionId')).toBe(String(region.divisionId));
  expect(draft.searchParams.get('name')).toBe(teamName);
  expect(draft.searchParams.get('acronym')).toBe(acronym);
  expect(draft.searchParams.get('joinPassword')).toBeNull();

  await resumeSignupAfterLogin(page, {
    steamId: user.steamId,
    username: user.username,
    returnTo,
  });

  await expect(page.getByRole('heading', { name: 'Create New 2v2 Team' })).toBeVisible();
  await expect(page.locator('#name')).toHaveValue(teamName);
  await expect(page.locator('#acronym')).toHaveValue(acronym);
  await expect(page.locator('#regionId')).toHaveValue(String(region.id));
  await expect(page.locator('#divisionId')).toHaveValue(String(region.divisionId));
  await expect(page.locator('#joinPassword')).toHaveValue('');

  await page.locator('#joinPassword').fill(JOIN_PASSWORD);
  await page.locator('input[name="rules"]').check();
  await Promise.all([
    page.waitForURL(/\/teams\/\d+/, { timeout: 30_000 }),
    page.getByRole('button', { name: /^Create/ }).click(),
  ]);

  const created = await getCreatedSignupTeam({
    formatId: matrix.formats.find((f) => f.code === '2v2')!.id,
    regionId: region.id,
    ownerSteamId: user.steamId,
  });
  expect(created).not.toBeNull();
  expect(created!.status).toBe('UNREADY');
});

test('1v1 draft survives the login hop and then submits', async ({ page }) => {
  const user = matrix.users[1];
  const region = matrix.allFormatRegions[0];

  await page.goto('/signup/1v1');
  await expect(page.getByRole('heading', { name: '1v1 League Signup' })).toBeVisible();
  await expect(page.getByText('Signing Up As')).toHaveCount(0);

  await selectControlled(page, '#regionId', { label: region.name });
  await expect(page.locator('#divisionId option').filter({ hasNotText: /Select/ })).not.toHaveCount(
    0,
    { timeout: 10_000 },
  );
  await selectControlled(page, '#divisionId', { value: String(region.divisionId) });
  await page.locator('input[name="rules"]').check();

  const returnTo = await submitSignupAndCaptureReturnTo(page, () =>
    page.getByRole('button', { name: /Sign Up for/ }).click(),
  );

  const draft = new URL(returnTo, 'http://localhost');
  expect(draft.pathname).toBe('/signup/1v1');
  expect(draft.searchParams.get('regionId')).toBe(String(region.id));
  expect(draft.searchParams.get('divisionId')).toBe(String(region.divisionId));

  await resumeSignupAfterLogin(page, {
    steamId: user.steamId,
    username: user.username,
    returnTo,
  });

  await expect(page.getByText('Signing Up As')).toBeVisible();
  await expect(page.locator('#regionId')).toHaveValue(String(region.id));
  await expect(page.locator('#divisionId')).toHaveValue(String(region.divisionId));

  await page.locator('input[name="rules"]').check();
  await Promise.all([
    page.waitForURL(new RegExp(`/users/${user.steamId}`), { timeout: 30_000 }),
    page.getByRole('button', { name: /Sign Up for/ }).click(),
  ]);

  const created = await getCreatedSignupTeam({
    formatId: matrix.formats.find((f) => f.code === '1v1')!.id,
    regionId: region.id,
    ownerSteamId: user.steamId,
  });
  expect(created).not.toBeNull();
});
