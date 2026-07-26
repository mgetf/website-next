import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function loginAs(
  browser: Browser,
  opts: {
    steamId: string;
    username?: string;
    role?: 'GUEST' | 'MODERATOR' | 'ADMIN';
    redirect?: string;
  },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const params = new URLSearchParams({
    steamId: opts.steamId,
    role: opts.role ?? 'GUEST',
    username: opts.username ?? `User ${opts.steamId.slice(-4)}`,
    redirect: opts.redirect ?? '/',
  });
  await page.goto(`/auth/test-login?${params.toString()}`);
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/test-login'));
  return { context, page };
}

/** Svelte-controlled number inputs use value= + oninput; fill() alone can be wiped. */
export async function fillControlled(page: Page, selector: string, value: string): Promise<void> {
  const input = page.locator(selector);
  await input.click();
  await input.fill('');
  await input.pressSequentially(value, { delay: 20 });
}

export async function submitBo1Scores(
  page: Page,
  opts: { homeScore: number; awayScore: number },
): Promise<void> {
  await fillControlled(page, '#homeScore-0', String(opts.homeScore));
  await fillControlled(page, '#awayScore-0', String(opts.awayScore));

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Submit Scores' }).click(),
  ]);
}

/** Submit a BoN series (games i uses #homeScore-i / #awayScore-i). Later games may be disabled once decided. */
export async function submitSeriesScores(
  page: Page,
  games: { homeScore: number; awayScore: number }[],
): Promise<void> {
  for (let i = 0; i < games.length; i++) {
    const home = page.locator(`#homeScore-${i}`);
    if ((await home.count()) === 0) break;
    if (await home.isDisabled()) break;
    await fillControlled(page, `#homeScore-${i}`, String(games[i].homeScore));
    await fillControlled(page, `#awayScore-${i}`, String(games[i].awayScore));
  }

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Submit Scores' }).click(),
  ]);
}

export async function postMatchMessage(page: Page, content: string): Promise<void> {
  await page.locator('textarea[name="content"]').fill(content);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Post Message' }).click(),
  ]);
  await expect(page.getByText(content)).toBeVisible({ timeout: 15_000 });
}

export async function requestReschedule(page: Page, proposedLocal: string): Promise<void> {
  await page.getByRole('button', { name: 'Request Reschedule' }).click();
  await page.locator('#proposedDateTime').fill(proposedLocal);
  await page.locator('#proposedTimezone').selectOption('UTC');
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Send Request' }).click(),
  ]);
  await expect(page.getByText('Reschedule Request Pending')).toBeVisible({ timeout: 15_000 });
}

export async function acceptReschedule(page: Page): Promise<void> {
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Accept' }).click(),
  ]);
  await expect(page.getByText('Reschedule Request Pending')).toHaveCount(0, { timeout: 15_000 });
}

export async function fileDispute(page: Page, reason: string): Promise<void> {
  await page.getByRole('button', { name: 'File Dispute' }).click();
  await page.locator('#disputeReason').fill(reason);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Submit Dispute' }).click(),
  ]);
  await expect(page.getByText('Disputed', { exact: true })).toBeVisible({ timeout: 20_000 });
}

export async function adminResolveDisputeScores(
  page: Page,
  opts: { homeScore: number; awayScore: number },
): Promise<void> {
  await page.getByRole('button', { name: 'Edit Scores' }).click();
  await expect(page.getByText('Edit Match Scores')).toBeVisible();

  await fillControlled(page, '#adminHomeScore-0', String(opts.homeScore));
  await fillControlled(page, '#adminAwayScore-0', String(opts.awayScore));

  const resolve = page.locator('input[name="resolveDispute"][type="checkbox"]');
  await expect(resolve).toBeVisible();
  await resolve.check();

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Save Scores' }).click(),
  ]);
  await expect(page.getByText('Played', { exact: true })).toBeVisible({ timeout: 20_000 });
}

export async function banOrPickMap(
  page: Page,
  mapName: string,
  action: 'ban' | 'pick',
): Promise<void> {
  await expect(page.getByText('Map Ban/Pick Phase')).toBeVisible();
  await expect(page.getByText('Available Maps')).toBeVisible();

  // Map tile: name + action label underneath
  const tile = page
    .locator('button')
    .filter({ hasText: mapName })
    .filter({ hasText: new RegExp(action, 'i') });
  await tile.click();

  const confirmLabel = action === 'ban' ? 'Ban Map' : 'Pick Map';
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: confirmLabel }).click(),
  ]);

  await expect(page.getByText(new RegExp(`${action === 'ban' ? 'banned' : 'picked'}.*${mapName}`, 'i'))).toBeVisible({
    timeout: 15_000,
  });
}
