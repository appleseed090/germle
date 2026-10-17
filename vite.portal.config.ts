import { defineConfig, type Plugin } from 'vite';
import type { LaunchStage } from './src/portal/platform/launch-stage.ts';
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

/**
 * The Vite mode that builds for CrazyGames' Full Launch, with ads; every other build is for Basic
 * Launch, where the game never requests an ad (see `src/portal/platform/launch-stage.ts`).
 * `npm run build:portal:full`, `dev:portal:full` and `preview:portal:full` pass it.
 */
export const FULL_LAUNCH_MODE = 'full-launch';

/** Vite's own modes, which build for Basic Launch. */
const BASIC_LAUNCH_MODES: ReadonlySet<string> = new Set(['production', 'development']);

/**
 * The launch stage a Vite mode builds for. Fails the build at once on any other mode, so a typo
 * never ships a build for the wrong stage.
 */
function launchStageFor(mode: string): LaunchStage {
  if (mode === FULL_LAUNCH_MODE) return 'full';
  if (BASIC_LAUNCH_MODES.has(mode)) return 'basic';
  throw new Error(
    `Unknown mode "${mode}" for the portal build: use the default or --mode ${FULL_LAUNCH_MODE}`,
  );
}

/** Each launch stage builds into its own folder, so both can be checked and zipped. */
export const PORTAL_OUT_DIRS: Readonly<Record<LaunchStage, string>> = {
  basic: 'dist-portal',
  full: 'dist-portal-full',
};

export default defineConfig(({ mode }) => {
  const launchStage = launchStageFor(mode);
  return {
    root: 'portal',
    base: './',
    publicDir: false,
    plugins: [crazyGamesSdkScript()],
    define: { __GERMLE_LAUNCH_STAGE__: JSON.stringify(launchStage) },
    server: { port: 5174, fs: { allow: ['..'] } },
    preview: { port: 4174 },
    build: {
      outDir: `../${PORTAL_OUT_DIRS[launchStage]}`,
      emptyOutDir: true,
      rollupOptions: {
        output: { chunkFileNames: 'assets/shared-[hash].js' },
      },
    },
  };
});
