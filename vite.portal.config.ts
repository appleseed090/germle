import { defineConfig, type Plugin } from 'vite';
import { CRAZYGAMES_SDK_URL } from './scripts/build-rules.ts';

/*
 * Germle Endless, the CrazyGames build. It shares `src/engine/` and `src/ui/board.ts` with
 * germle.com but has its own page shell (`portal/index.html`), entry (`src/portal/main.ts`) and
 * output (`dist-portal/`). germle.com's `vite.config.ts` never sees any of it; see CLAUDE.md.
 *
 * CrazyGames serves the game from a path of its own inside an iframe, so every URL in the output
 * is relative (`base: './'`).
 */

/**
 * Loads the CrazyGames SDK in the production build only, as a classic script in `<head>`. The
 * SDK docs ask for it before the game's own code; the game's module script is deferred, so the
 * classic script always runs first. `npm run dev:portal` uses the local platform instead, so it
 * works offline and never contacts CrazyGames.
 */
function crazyGamesSdkScript(): Plugin {
  return {
    name: 'germle-endless:crazygames-sdk',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { src: CRAZYGAMES_SDK_URL }, injectTo: 'head' }];
    },
  };
}

export default defineConfig({
  root: 'portal',
  base: './',
  publicDir: false,
  plugins: [crazyGamesSdkScript()],
  server: { port: 5174, fs: { allow: ['..'] } },
  preview: { port: 4174 },
  build: {
    outDir: '../dist-portal',
    emptyOutDir: true,
    rollupOptions: {
      output: { chunkFileNames: 'assets/shared-[hash].js' },
    },
  },
});
