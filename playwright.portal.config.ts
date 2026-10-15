import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

/**
 * End-to-end tests for Germle Endless against the portal build in `dist-portal/` (run
 * `npm run build:portal` first), served by `vite preview`. The CrazyGames SDK is replaced by a
 * recording fake (see `e2e-portal/fixtures.ts`). Viewports: the 16:9 desktop frame CrazyGames
 * embeds games in, and a phone held both ways.
 */
export default defineConfig({
  testDir: 'e2e-portal',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
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
  webServer: {
    command: `npx vite preview --config vite.portal.config.ts --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
  },
});
