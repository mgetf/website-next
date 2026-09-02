import { expect, type Page } from '@playwright/test';

/**
 * Submit a signup form while logged out and capture the post-login return path
 * without following Steam OpenID.
 */
export async function submitSignupAndCaptureReturnTo(
  page: Page,
  submit: () => Promise<void>,
): Promise<string> {
  let returnTo = '';
  await page.route('**/auth/login**', async (route) => {
    const url = new URL(route.request().url());
    returnTo = url.searchParams.get('redirect') ?? '';
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body>login intercepted</body></html>',
    });
  });

  await submit();
  await expect.poll(() => returnTo, { timeout: 15_000 }).not.toEqual('');
  await page.unroute('**/auth/login**');
  return returnTo;
}

export async function resumeSignupAfterLogin(
  page: Page,
  opts: { steamId: string; username: string; returnTo: string },
): Promise<void> {
  const params = new URLSearchParams({
    steamId: opts.steamId,
    username: opts.username,
    redirect: opts.returnTo,
  });
  await page.goto(`/auth/test-login?${params.toString()}`);
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/test-login'));
}
