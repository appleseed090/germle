import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
    // Lets `main.css?raw` return the real stylesheet for the theme tests; Vitest blanks CSS otherwise.
    css: true,
  },
});
