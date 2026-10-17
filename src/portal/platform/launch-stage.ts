import type { AdsPlatform } from './platform';

/**
 * Which CrazyGames launch stage a build is for, set at build time (`vite.portal.config.ts`).
 *
 * Every new game starts in Basic Launch, where ads are disabled and the review rejects "rewarded
 * ad buttons without effect". The SDK only says ads are disabled after an ad request fails, so the
 * Basic Launch build never requests one and shows no rewarded offers. The Full Launch build, with
 * ads, is uploaded once CrazyGames moves the game to Full Launch.
 */
export type LaunchStage = 'basic' | 'full';

/** The gameplay and loading events every launch stage reports to the portal. */
export type GameplayEvents = Pick<
  AdsPlatform,
  'gameplayStart' | 'gameplayStop' | 'loadingStart' | 'loadingStop' | 'happyTime'
>;

/**
 * Ads for the Basic Launch build: no ad is ever requested and rewarded offers are never shown,
 * while gameplay and loading events still reach the portal.
 */
export function adsWithoutAdRequests(events: GameplayEvents): AdsPlatform {
  return {
    ...events,
    showMidgameAd: () => Promise.resolve(),
    showRewardedAd: () => Promise.resolve(false),
    rewardedAds: () => 'unavailable',
  };
}
