import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config
 *
 * BASE_URL é injetado pelo CI:
 *   - PR: URL do preview Vercel daquele PR (banco = branch descartável)
 *   - pós-deploy main: URL de produção (banco = produção real)
 *
 * Local: fallback para http://localhost:5173 (npm run dev).
 */

const baseURL = process.env.BASE_URL || 'http://localhost:5173';
const isCI = !!process.env.CI;
const smokeOnly = process.env.SMOKE_ONLY === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  globalSetup: './tests/e2e/global-setup.ts',

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      testIgnore: smokeOnly ? /.*(?<!\.smoke)\.spec\.ts$/ : undefined,
    },
  ],
});
