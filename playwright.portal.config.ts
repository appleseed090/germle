import { defineConfig, devices } from '@playwright/test';

/** Where `vite preview` serves the Full Launch build (`dist-portal-full/`), the tests' default. */
const FULL_LAUNCH_PORT = 4174;
/** Where it serves the Basic Launch build (`dist-portal/`); `basic-launch.spec.ts` uses it. */
export const BASIC_LAUNCH_URL = 'http://localhost:4175';

/**
 * End-to-end tests for Germle Endless against both portal builds (run `npm run build:portal` and
 * `npm run build:portal:full` first), served by `vite preview`. The CrazyGames SDK is replaced by
 * a recording fake (see `e2e-portal/fixtures.ts`). Viewports: the 16:9 desktop frame CrazyGames
 * embeds games in, and a phone held both ways.
 */
export default defineConfig({
  testDir: 'e2e-portal',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${FULL_LAUNCH_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-16x9',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    { name: 'phone-landscape', use: { ...devices['Pixel 7 landscape'] } },
    { name: 'phone-portrait', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `npx vite preview --config vite.portal.config.ts --mode full-launch --port ${FULL_LAUNCH_PORT} --strictPort`,
      url: `http://localhost:${FULL_LAUNCH_PORT}`,
      reuseExistingServer: !process.env['CI'],
    },
    {
      command: `npx vite preview --config vite.portal.config.ts --port ${new URL(BASIC_LAUNCH_URL).port} --strictPort`,
      url: BASIC_LAUNCH_URL,
      reuseExistingServer: !process.env['CI'],
    },
  ],
});
