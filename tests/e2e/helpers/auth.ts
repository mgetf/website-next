import type { Browser, BrowserContext, Page } from '@playwright/test';

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

export async function submitBo1Scores(
  page: Page,
  opts: { homeScore: number; awayScore: number },
): Promise<void> {
  // These inputs are Svelte-controlled via value= + oninput; plain fill() can be
  // wiped on re-render. Drive the oninput handler explicitly.
  const fillControlled = async (selector: string, value: string) => {
    const input = page.locator(selector);
    await input.click();
    await input.fill('');
    await input.pressSequentially(value, { delay: 20 });
  };

  await fillControlled('#homeScore-0', String(opts.homeScore));
  await fillControlled('#awayScore-0', String(opts.awayScore));

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Submit Scores' }).click(),
  ]);
}
