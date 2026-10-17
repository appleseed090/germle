/**
 * Entry point of Germle Endless, the CrazyGames build (`portal/index.html`). Never imported by
 * germle.com code; ESLint and `scripts/check-builds.ts` enforce that.
 */
import '../styles/main.css';
import './portal.css';
import { requireElement } from '../ui/dom';
import { startApp } from './app';
import { basicLaunchAds, createCrazyGamesPlatform, fullLaunchAds } from './platform/crazygames';
import { createLocalPlatform } from './platform/local';
import type { Platform } from './platform/platform';

// The dev server gets the local stand-in; the production build only ever talks to CrazyGames
// (Vite replaces `import.meta.env.DEV`, so the local platform is dropped from that bundle). The
// launch stage comes from the build (`vite.portal.config.ts`).
const platform: Platform = import.meta.env.DEV
  ? createLocalPlatform(__GERMLE_LAUNCH_STAGE__)
  : await createCrazyGamesPlatform(
      (window as unknown as { CrazyGames?: { SDK?: unknown } }).CrazyGames?.SDK,
      // A build-time constant: the bundler drops the ads the build does not use.
      __GERMLE_LAUNCH_STAGE__ === 'full' ? fullLaunchAds : basicLaunchAds,
    );
platform.ads.loadingStart();
// startApp calls loadingStop itself, before the first gameplayStart.
startApp(requireElement('portal-app', HTMLElement), platform);
