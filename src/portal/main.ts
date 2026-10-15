/**
 * Entry point of Germle Endless, the CrazyGames build (`portal/index.html`). Never imported by
 * germle.com code; ESLint and `scripts/check-builds.ts` enforce that.
 */
import '../styles/main.css';
import './portal.css';
import { requireElement } from '../ui/dom';
import { startApp } from './app';
import { createCrazyGamesPlatform } from './platform/crazygames';
import { createLocalPlatform } from './platform/local';
import type { Platform } from './platform/platform';

// The dev server gets the local stand-in; the production build only ever talks to CrazyGames
// (Vite replaces `import.meta.env.DEV`, so the local platform is dropped from that bundle).
const platform: Platform = import.meta.env.DEV
  ? createLocalPlatform()
  : await createCrazyGamesPlatform(
      (window as unknown as { CrazyGames?: { SDK?: unknown } }).CrazyGames?.SDK,
    );
platform.ads.loadingStart();
startApp(requireElement('portal-app', HTMLElement), platform);
platform.ads.loadingStop();
