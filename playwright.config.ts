import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const externalBaseURL = process.env.BASE_URL;
const preview = process.env.TEST_PREVIEW === '1';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
// drAW2D and drAW3D hold 4173; this port lets their tests run at the same time.
const port = 4175;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: externalBaseURL ?? `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externalBaseURL ? undefined : {
    command: `npm run ${preview ? 'preview' : 'dev'} -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
