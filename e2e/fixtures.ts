import { expect, test as base } from '@playwright/test';

/**
 * Playwright's `test`, extended so that any Content-Security-Policy violation fails the test.
 * `vite preview` serves the production headers from `public/_headers`, and Chromium reports each
 * blocked inline script or style as a console error.
 */
export const test = base.extend<{ contentSecurityPolicyViolations: string[] }>({
  contentSecurityPolicyViolations: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && message.text().includes('Content Security Policy'))
          violations.push(message.text());
      });
      await use(violations);
      expect(violations, 'Content-Security-Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
