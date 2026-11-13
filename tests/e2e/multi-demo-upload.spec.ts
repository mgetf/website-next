import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loginAs, adminCreateWeekMatch, selectControlled } from './helpers/auth';
import {
  E2E_USERS,
  resetDatabase,
  seedLeagueInfrastructure,
  seedUsers,
  seedReadyTeam,
  getLatestMatchId,
  type SeasonSeed,
} from './helpers/season';

/**
 * Multi-demo upload on a match page.
 *
 * R2 storage is not configured in the e2e environment, so the server cannot
 * actually persist demos. These tests cover the client selection flow and the
 * server's per-file validation/batching up to the storage call, which fails
 * with "Failed to upload demo to storage" when R2 is absent.
 */
test.describe.configure({ mode: 'serial' });

const JOIN_PASSWORD = 'join-pass-123';

let league: SeasonSeed;
let matchId: number;
let captain: { context: BrowserContext; page: Page };

function submitButton(page: Page) {
  return page.locator('form[action="?/uploadDemo"] button[type="submit"]');
}

function demoBuffer(label: string, sizeBytes = 1024): Buffer {
  const buf = Buffer.alloc(sizeBytes, 0);
  buf.write(`DEMO-${label}`, 0, 'ascii');
  return buf;
}

test.afterAll(async () => {
  await captain?.context.close();
});

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5433/mgetf_test';

  await resetDatabase();
  await seedUsers();
  league = await seedLeagueInfrastructure();

  await seedReadyTeam({
    name: 'Home Demo Team',
    acronym: 'HDT',
    captainSteamId: E2E_USERS.homeCaptain.steamId,
    teammateSteamId: E2E_USERS.homeTeammate.steamId,
    regionId: league.regionId,
    divisionId: league.divisionId,
    seasonId: league.seasonId,
    joinPassword: JOIN_PASSWORD,
  });
  await seedReadyTeam({
    name: 'Away Demo Team',
    acronym: 'ADT',
    captainSteamId: E2E_USERS.awayCaptain.steamId,
    teammateSteamId: E2E_USERS.awayTeammate.steamId,
    regionId: league.regionId,
    divisionId: league.divisionId,
    seasonId: league.seasonId,
    joinPassword: JOIN_PASSWORD,
  });

  const admin = await loginAs(browser, {
    steamId: E2E_USERS.admin.steamId,
    username: E2E_USERS.admin.username,
    role: 'ADMIN',
    redirect: '/admin',
  });
  await adminCreateWeekMatch(admin.page, league, { weekNo: 1, boSeries: 1 });
  matchId = await getLatestMatchId({ weekNo: 1 });
  await admin.context.close();

  captain = await loginAs(browser, {
    steamId: E2E_USERS.homeCaptain.steamId,
    username: E2E_USERS.homeCaptain.username,
    role: 'GUEST',
    redirect: `/matches/${matchId}`,
  });
});

async function openUploadModal(page: Page) {
  await page.goto(`/matches/${matchId}`);
  await page.getByRole('button', { name: 'Upload Demo' }).click();
  await expect(page.getByRole('heading', { name: 'Upload Demo' })).toBeVisible();
}

test('file picker accepts multiple .dem files and lists each one', async () => {
  const page = captain.page;
  await openUploadModal(page);

  const input = page.locator('#demoFile');
  await expect(input).toHaveAttribute('multiple', '');

  await input.setInputFiles([
    { name: 'match-one.dem', mimeType: 'application/octet-stream', buffer: demoBuffer('1') },
    { name: 'match-two.dem', mimeType: 'application/octet-stream', buffer: demoBuffer('2') },
    { name: 'match-three.dem', mimeType: 'application/octet-stream', buffer: demoBuffer('3') },
  ]);

  await expect(page.getByText('match-one.dem')).toBeVisible();
  await expect(page.getByText('match-two.dem')).toBeVisible();
  await expect(page.getByText('match-three.dem')).toBeVisible();
  await expect(page.getByText('3 files', { exact: false })).toBeVisible();
  await expect(submitButton(page)).toBeEnabled();
});

test('removing one file keeps the others selected for upload', async () => {
  const page = captain.page;
  const dialog = page.getByRole('dialog');

  await dialog.getByRole('button', { name: 'Remove match-two.dem' }).click();

  await expect(page.getByText('match-two.dem')).toHaveCount(0);
  await expect(page.getByText('match-one.dem')).toBeVisible();
  await expect(page.getByText('match-three.dem')).toBeVisible();
  await expect(dialog.getByText('2 files', { exact: false })).toBeVisible();
});

test('rejects a non-.dem file in a batch without selecting any files', async () => {
  const page = captain.page;
  await openUploadModal(page);

  await page.locator('#demoFile').setInputFiles([
    { name: 'good.dem', mimeType: 'application/octet-stream', buffer: demoBuffer('ok') },
    { name: 'bad.zip', mimeType: 'application/zip', buffer: demoBuffer('bad') },
  ]);

  await expect(page.getByText(/Invalid file type for "bad\.zip"/)).toBeVisible();
  await expect(submitButton(page)).toBeDisabled();
});

test('rejects a file over 200MB in a batch', async () => {
  const page = captain.page;
  await openUploadModal(page);

  // Playwright refuses in-memory buffers over 50MB, so write the oversized fixture to disk.
  const dir = mkdtempSync(join(tmpdir(), 'demo-oversize-'));
  const oversizedPath = join(dir, 'huge.dem');
  writeFileSync(oversizedPath, Buffer.alloc(200 * 1024 * 1024 + 1, 0));
  await page.locator('#demoFile').setInputFiles(oversizedPath);
  rmSync(dir, { recursive: true, force: true });

  await expect(page.getByText(/"huge\.dem" is too large/)).toBeVisible();
  await expect(submitButton(page)).toBeDisabled();
});

test('rejects more than 10 files at once', async () => {
  const page = captain.page;
  await openUploadModal(page);

  const eleven = Array.from({ length: 11 }, (_, i) => ({
    name: `bulk-${i + 1}.dem`,
    mimeType: 'application/octet-stream',
    buffer: demoBuffer(String(i + 1)),
  }));
  await page.locator('#demoFile').setInputFiles(eleven);

  await expect(page.getByText('You can upload at most 10 demos at once.')).toBeVisible();
  await expect(submitButton(page)).toBeDisabled();
});

test('submitting a batch sends every selected file to the server', async () => {
  const page = captain.page;
  await openUploadModal(page);

  await page.locator('#demoFile').setInputFiles([
    { name: 'batch-a.dem', mimeType: 'application/octet-stream', buffer: demoBuffer('a') },
    { name: 'batch-b.dem', mimeType: 'application/octet-stream', buffer: demoBuffer('b') },
  ]);
  await selectControlled(page, '#playerSteamId', { value: E2E_USERS.homeCaptain.steamId });

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('?/uploadDemo') && req.method() === 'POST'),
    submitButton(page).click(),
  ]);

  const body = request.postDataBuffer()?.toString('latin1') ?? '';
  const sentFiles = [...body.matchAll(/name="file"; filename="([^"]+)"/g)].map((m) => m[1]);
  expect(sentFiles).toEqual(['batch-a.dem', 'batch-b.dem']);

  // Without R2 configured the server rejects at storage, proving the whole
  // batch reached the upload path rather than being dropped client-side.
  await expect(page.getByText('Failed to upload demo to storage')).toBeVisible({
    timeout: 30_000,
  });
});
