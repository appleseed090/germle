/**
 * Values `vite.portal.config.ts` writes into the portal build. Only `main.ts` reads them; the rest
 * of the game takes them as parameters, so unit tests never need them.
 */
declare const __GERMLE_LAUNCH_STAGE__: import('./platform/launch-stage').LaunchStage;
