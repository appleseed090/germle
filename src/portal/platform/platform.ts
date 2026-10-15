/**
 * The only way Germle Endless talks to the portal it runs on. Game code imports these interfaces
 * and never the CrazyGames SDK; `main.ts` picks an implementation: `crazygames.ts` in the
 * production build, `local.ts` for `npm run dev:portal`.
 */

/** Called around an ad so the game can pause and mute exactly while it plays. */
export interface AdHooks {
  /** The ad has started: mute audio and block input now (not at request time). */
  readonly onAdStarted: () => void;
}

/** Ads and gameplay events. Every method is safe to call at any time and never throws. */
export interface AdsPlatform {
  /**
   * Shows a midgame ad at a natural break, if the platform allows one now (it enforces its own
   * frequency limits).
   *
   * @returns Resolves when the ad is over, failed, was blocked or was skipped. Never rejects.
   */
  showMidgameAd(hooks: AdHooks): Promise<void>;
  /**
   * Shows a rewarded ad the player asked for.
   *
   * @returns `true` only if the ad played to the end and the reward is earned; `false` if it
   *   failed, was blocked or is unavailable. Never rejects.
   */
  showRewardedAd(hooks: AdHooks): Promise<boolean>;
  /** The player is now playing (a level started or resumed). */
  gameplayStart(): void;
  /** The player stopped playing (a level ended, a menu or summary opened). */
  gameplayStop(): void;
  loadingStart(): void;
  loadingStop(): void;
  /** A moment of joy worth celebrating, such as a new best run. Use sparingly. */
  happyTime(): void;
}

/** A small key-value store for the save. Synchronous, like the CrazyGames Data module. */
export interface SavePlatform {
  getItem(key: string): string | null;
  /** Best effort: a failed write is dropped, never thrown. */
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Score submission, where the portal offers a leaderboard for this game. */
export interface LeaderboardPlatform {
  /** Whether scores can be submitted; the game hides leaderboard mentions otherwise. */
  readonly available: boolean;
  /** Submits a finished run's levels cleared. Best effort; never throws. */
  submitLevelsCleared(levelsCleared: number): void;
}

/** Everything the game needs from the portal. */
export interface Platform {
  readonly ads: AdsPlatform;
  readonly saves: SavePlatform;
  readonly leaderboard: LeaderboardPlatform;
  /** Whether the portal asks for the game to be silent, whatever the player's own setting. */
  isAudioMutedByPortal(): boolean;
  /** Calls `listener` whenever the portal's mute request changes. */
  onPortalMuteChange(listener: (muted: boolean) => void): void;
}
