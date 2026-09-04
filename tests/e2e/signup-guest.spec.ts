import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { resetDatabase } from './helpers/season';
import { seedSignupMatrix, type SignupMatrix } from './helpers/signupMatrix';

/**
 * Guests can browse /signup. Action CTAs send them to Steam login
 * instead of letting them fill the form first.
 */
test.describe.configure({ mode: 'serial' });

let matrix: SignupMatrix;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5432/mgetf_test';

  await resetDatabase();
  matrix = await seedSignupMatrix();
});

test('guest can open signup and CTAs ask them to log in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Register Your Team/ })).toHaveAttribute(
    'href',
    '/signup',
  );

  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'League Signups' })).toBeVisible();

  const createCard = page.getByRole('link', { name: /brand new 2v2 team/i });
  await expect(createCard).toContainText('Login to participate!');
  await expect(createCard).toHaveAttribute('href', '/auth/login?redirect=%2Fsignup%2F2v2%2Fcreate');

  const oneVOneCard = page.getByRole('link', { name: /sign up as an individual player/i });
  await expect(oneVOneCard).toContainText('Login to participate!');
  await expect(oneVOneCard).toHaveAttribute('href', '/auth/login?redirect=%2Fsignup%2F1v1');
});

test('guest create page shows a login gate instead of the form', async ({ page }) => {
  await page.goto('/signup/2v2/create');
  await expect(page.getByRole('heading', { name: 'Create New 2v2 Team' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Login to participate' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Login to participate!' })).toHaveAttribute(
    'href',
    '/auth/login?redirect=%2Fsignup%2F2v2%2Fcreate',
  );
  await expect(page.locator('#regionId')).toHaveCount(0);
});

test('after login the create form is available', async ({ browser }) => {
  const user = matrix.users[0];
  const session = await loginAs(browser, {
    steamId: user.steamId,
    username: user.username,
    redirect: '/signup/2v2/create',
  });

  try {
    await expect(session.page.getByRole('heading', { name: 'Create New 2v2 Team' })).toBeVisible();
    await expect(session.page.locator('#regionId')).toBeVisible();
  } finally {
    await session.context.close();
  }
});
