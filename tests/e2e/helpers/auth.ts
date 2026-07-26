import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { SeasonSeed } from './season';

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

/** Submit a BoN series (game i uses #homeScore-i / #awayScore-i). Later games may be disabled once decided. */
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

export async function denyReschedule(page: Page): Promise<void> {
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Deny' }).click(),
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

/** Resolve via /admin/disputes panel (accept result as PLAYED). */
export async function adminResolveDisputePanel(page: Page): Promise<void> {
  await page.goto('/admin/disputes');
  await expect(page.getByRole('heading', { name: 'Disputed Matches' })).toBeVisible();
  // Default status is already PLAYED
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Resolve' }).click(),
  ]);
}

export async function banOrPickMap(
  page: Page,
  mapName: string,
  action: 'ban' | 'pick',
): Promise<void> {
  await expect(page.getByText('Map Ban/Pick Phase')).toBeVisible();
  await expect(page.getByText('Available Maps')).toBeVisible();

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

  // Tile leaves Available Maps; on final pick the whole map-ban section unmounts.
  await expect(tile).toHaveCount(0, { timeout: 15_000 });
}

export async function adminCreateWeekMatch(
  page: Page,
  league: SeasonSeed,
  opts?: { weekNo?: number; boSeries?: number; arenaId?: number },
): Promise<void> {
  const weekNo = opts?.weekNo ?? 1;
  const boSeries = opts?.boSeries ?? 1;
  const arenaId = opts?.arenaId ?? league.arenaIds[0];

  await page.goto('/admin/matches/create');
  await expect(page.getByRole('heading', { name: 'Create Match Set' })).toBeVisible();

  await page.locator('#regionId').selectOption(String(league.regionId));
  await expect(page.locator('#divisionId option').filter({ hasText: 'Invite' })).toHaveCount(1, {
    timeout: 10_000,
  });
  await page.locator('#divisionId').selectOption(String(league.divisionId));
  await page.locator('#seasonId').selectOption(String(league.seasonId));
  await page.locator('#weekNo').fill(String(weekNo));
  await page.locator('#arenaId').selectOption(String(arenaId));
  await page.locator('#boSeries').selectOption(String(boSeries));

  await page.getByRole('button', { name: 'Preview Match Set' }).click();
  await expect(page.getByText('Match Preview')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/1 match/)).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/admin\/matches\?created=/),
    page.getByRole('button', { name: /Create \d+ Match/ }).click(),
  ]);
}

export async function adminCreatePlayoffMatch(
  page: Page,
  league: SeasonSeed,
  opts: { homeTeamId: number; awayTeamId: number; boSeries?: number },
): Promise<void> {
  const boSeries = opts.boSeries ?? 3;

  await page.goto('/admin/matches/create');
  await expect(page.getByRole('heading', { name: 'Create Match Set' })).toBeVisible();

  await page.locator('input[name="isPlayoff"]').check();
  await page.locator('#regionId').selectOption(String(league.regionId));
  await expect(page.locator('#divisionId option').filter({ hasText: 'Invite' })).toHaveCount(1, {
    timeout: 10_000,
  });
  await page.locator('#divisionId').selectOption(String(league.divisionId));
  await page.locator('#seasonId').selectOption(String(league.seasonId));
  await expect(page.locator('#playoffRound option').filter({ hasText: 'Upper Round' })).toHaveCount(
    1,
    { timeout: 10_000 },
  );
  await page.locator('#playoffRound').selectOption('1');
  await page.locator('#mapBanPoolId').selectOption(String(league.mapBanPoolId));
  await page.locator('#boSeries').selectOption(String(boSeries));

  await page.getByRole('button', { name: 'Preview Match Set' }).click();
  await expect(page.getByText('Match Preview')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Select teams manually/i)).toBeVisible();

  // Playoff form uses name=homeTeamIds / awayTeamIds (may share ids with FormSelect)
  await page.locator('select[name="homeTeamIds"]').selectOption(String(opts.homeTeamId));
  await page.locator('select[name="awayTeamIds"]').selectOption(String(opts.awayTeamId));

  await Promise.all([
    page.waitForURL(/\/admin\/matches\?created=/),
    page.getByRole('button', { name: /Create \d+ Playoff Match/ }).click(),
  ]);
}

export async function adminEditSchedule(page: Page, proposedLocal: string): Promise<void> {
  await page.getByRole('button', { name: 'Edit Schedule' }).click();
  await expect(page.getByText('Edit Match Schedule')).toBeVisible();
  await page.locator('#adminMatchDateTime').fill(proposedLocal);
  await page.locator('#matchTimezone').selectOption('UTC');
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Save Schedule' }).click(),
  ]);
}

export async function adminEditArenas(page: Page, arenaName: string): Promise<void> {
  await page.getByRole('button', { name: 'Edit Arenas' }).click();
  await expect(page.getByText('Edit Match Arenas')).toBeVisible();
  // First game arena select
  const arenaSelect = page.locator('select[name="arenaId"]').first();
  await arenaSelect.selectOption({ label: arenaName });
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Save Arenas' }).click(),
  ]);
}

/** Admin declines a pending player on /admin/pending-players (must already be on that page with the row visible). */
export async function adminDeclinePendingPlayer(
  page: Page,
  username: string,
  reason: string,
): Promise<void> {
  await expect(page.getByText(username)).toBeVisible();
  await page.getByRole('button', { name: '✗ Decline' }).click();
  await page.locator('input[name="reason"]').fill(reason);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Confirm' }).click(),
  ]);
}

/** Captain removes a roster player from /teams/:id/edit roster tab. */
export async function captainRemovePlayer(page: Page, playerName: string): Promise<void> {
  const row = page
    .locator('div.flex.items-center.justify-between')
    .filter({ hasText: playerName })
    .first();
  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('heading', { name: 'Remove Player' })).toBeVisible();
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.locator('button').filter({ hasText: /^Remove$/ }).last().click(),
  ]);
}

/** Read invite link from team edit → Invite Players tab. */
export async function readInviteLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Invite Players' }).click();
  const input = page.locator('input[readonly]').first();
  const value = await input.inputValue();
  if (!value.includes('/teams/join?token=')) {
    throw new Error(`Expected invite URL, got: ${value}`);
  }
  return value;
}

export async function acceptInviteLink(page: Page, inviteUrl: string): Promise<void> {
  await page.goto(inviteUrl);
  await expect(page.getByRole('button', { name: 'Accept Invitation' })).toBeVisible();
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Accept Invitation' }).click(),
  ]);
}

export async function declineSteamInvitation(page: Page, teamName: string): Promise<void> {
  await page.goto('/invitations');
  await expect(page.getByText(teamName)).toBeVisible();
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Decline' }).click(),
  ]);
}

export async function cancelPendingInvite(page: Page, username: string): Promise<void> {
  await page.getByRole('button', { name: /Pending/ }).click();
  await expect(page.getByText(username)).toBeVisible();
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Cancel' }).click(),
  ]);
}

export async function adminMarkPlayerPaid(page: Page, playerName: string): Promise<void> {
  const row = page
    .locator('div')
    .filter({ hasText: playerName })
    .filter({ hasText: 'Mark as Paid' })
    .first();
  await row.getByRole('button', { name: 'Mark as Paid' }).click();
  await expect(page.getByRole('heading', { name: 'Mark as Paid' })).toBeVisible();
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Mark as Paid' }).last().click(),
  ]);
}

export async function reportDemoOnMatch(page: Page, reason: string): Promise<void> {
  await expect(page.getByRole('button', { name: 'Report' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Report' }).first().click();
  await expect(page.getByRole('heading', { name: 'Report Demo' })).toBeVisible();
  await page.locator('#reportDescription').fill(reason);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Submit Report' }).click(),
  ]);
  await expect(page.getByText(/Your Report:/i).first()).toBeVisible({ timeout: 15_000 });
}

export async function adminResolveDemoReport(
  page: Page,
  status: 'ACTION' | 'CLEAR' = 'ACTION',
  comment = 'E2E reviewed',
): Promise<void> {
  await page.goto('/admin/demos');
  await expect(page.getByRole('heading', { name: 'Demo Reports' })).toBeVisible();
  await page.locator('select[name="status"]').first().selectOption(status);
  await page.locator('textarea[name="adminComments"]').first().fill(comment);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Update Status' }).first().click(),
  ]);
}

export async function adminCreateLeagueRegion(page: Page, name: string): Promise<void> {
  await page.goto('/admin/league?tab=regions');
  await page.getByRole('button', { name: '+ Add Region' }).click();
  await page.locator('#region-name').fill(name);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Create Region' }).click(),
  ]);
  await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
}

export async function adminCreateLeagueDivision(
  page: Page,
  opts: { name: string; regionLabel: string; signupCost?: string },
): Promise<void> {
  await page.goto('/admin/league?tab=divisions');
  await page.getByRole('button', { name: '+ Add Division' }).click();
  await page.locator('#division-name').fill(opts.name);
  await page.locator('#division-region').selectOption({ label: opts.regionLabel });
  if (opts.signupCost !== undefined) {
    await page.locator('#signup-cost').fill(opts.signupCost);
  }
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Create Division' }).click(),
  ]);
  await expect(page.getByText(opts.name)).toBeVisible({ timeout: 15_000 });
}

export async function adminCreateLeagueArena(page: Page, name: string): Promise<void> {
  await page.goto('/admin/league?tab=arenas');
  await page.getByRole('button', { name: '+ Add Arena' }).click();
  await page.locator('#arena-name').fill(name);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Create Arena' }).click(),
  ]);
  await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
}

export async function adminCreateLeagueSeason(
  page: Page,
  opts: { seasonNum: number; regionLabel: string; formatLabel: string; numWeeks: number },
): Promise<void> {
  await page.goto('/admin/league?tab=seasons');
  await page.getByRole('button', { name: '+ Create Season' }).click();
  await page.locator('#seasonNum').fill(String(opts.seasonNum));
  await page.locator('#regionId').selectOption({ label: opts.regionLabel });
  await page.locator('#formatId').selectOption({ label: opts.formatLabel });
  await page.locator('#numWeeks').fill(String(opts.numWeeks));
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Create Season' }).click(),
  ]);
  // Seasons list is grouped by format — select the format chip if present
  const formatChip = page.getByRole('button', { name: opts.formatLabel });
  if (await formatChip.count()) {
    await formatChip.click();
  }
  await expect(page.getByText(`Season ${opts.seasonNum}`).first()).toBeVisible({
    timeout: 15_000,
  });
}
