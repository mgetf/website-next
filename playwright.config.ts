import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      'bun run build && bun --env-file=.env.test run preview -- --host 127.0.0.1 --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL || 'postgresql://mgetf:mgetf@localhost:5432/mgetf_test',
      APP_ENVIRONMENT: 'development',
      JWT_SECRET: process.env.JWT_SECRET || 'e2e-test-jwt-secret-at-least-32-chars-long',
      SESSION_SECRET: process.env.SESSION_SECRET || 'e2e-test-session-secret-32chars!!',
      STEAM_API_KEY: process.env.STEAM_API_KEY || 'test-steam-api-key-not-used',
      PUBLIC_URL: baseURL,
    },
  },
});
