import type { NodeStatus } from '../engine';
import type { Verdict } from '../verdict';

/**
 * Translations of the page shells' text, keyed by the elements' `data-i18n` attribute (their
 * content) and `data-i18n-label` attribute (their `aria-label`). A content translation may name
 * the element's child elements by tag, `<a>archive</a>` or `<strong></strong>`, to place them;
 * see `translatePageShell`.
 */
export type ShellTranslations = Readonly<Record<string, string>>;

/**
 * Every piece of text the scripts write, in one language. The page shells are written in
 * English, so English has no {@link ShellTranslations}. Counts arrive as numbers and each
 * language words and pluralises them itself.
 */
export interface Messages {
  /** `undefined` for English, the language the page shells are written in. */
  readonly shell: ShellTranslations | undefined;
  /** The one-word outcome of a finished game. */
  readonly verdicts: Readonly<Record<Verdict, string>>;
  /** How each verdict is earned, after its bold verdict word: `: 70% or more saved.` */
  readonly verdictRule: {
    readonly contained: (thresholdPercent: number) => string;
    readonly spread: (thresholdPercent: number) => string;
    /** Between the two clauses. */
    readonly separator: string;
  };
  /** The one-line puzzle summary: `40 people · 4 vaccines · … · 35% contagious`. */
  readonly summary: {
    readonly people: (count: number) => string;
    readonly vaccines: (count: number) => string;
    readonly outbreaks: (count: number) => string;
    readonly refusers: (count: number) => string;
    readonly contagious: (percent: number) => string;
    /** A practice game's seed, as the summary's last part. */
    readonly seed: (seed: string) => string;
    /** The how-to-play dialog's line about the daily constants. */
    readonly everyDailyPuzzle: (summary: string) => string;
  };
  /** The toolbar, toasts, screen-reader announcements and board labels of a game. */
  readonly game: {
    readonly phaseVaccinate: string;
    readonly phaseQuarantine: string;
    readonly vaccinesLeft: (count: number) => string;
    readonly vaccinateInstruction: (vaccineCount: number) => string;
    readonly quarantinedCount: (count: number) => string;
    readonly infectedCount: (count: number) => string;
    readonly quarantineInstruction: string;
    readonly percentSaved: (score: number) => string;
    readonly endedInstruction: string;
    readonly alreadyInfected: string;
    readonly refusesVaccines: string;
    /** People are numbered from 1 for players: `person` is the node index plus one. */
    readonly announceVaccinated: (person: number, vaccinesLeft: number) => string;
    readonly announceOutbreak: (people: readonly number[]) => string;
    readonly announceQuarantined: (person: number) => string;
    readonly announceSpread: (day: number, newInfections: number) => string;
    readonly announceEnded: (verdict: Verdict, score: number) => string;
    readonly boardLabel: string;
    /** A person's label on the board, for screen readers. */
    readonly describePerson: (
      person: number,
      status: NodeStatus,
      refusesVaccines: boolean,
      contacts: number,
    ) => string;
  };
  readonly results: {
    readonly copied: string;
    readonly finishThisPuzzle: string;
  };
  /** The comparison with everyone who played the puzzle. */
  readonly community: {
    /** `Better than 72% of 318 players`. */
    readonly rank: (percentBeaten: number, players: number) => string;
    /** The top score and how many reached it, which the page joins with " · ". */
    readonly topScore: (best: number) => string;
    readonly reachedBy: (players: number) => string;
    /** One chart column for screen readers; `band` is a score range such as `70–79`. */
    readonly band: (band: string, players: number, isYours: boolean) => string;
    /** Marks the player's own column. */
    readonly you: string;
  };
  readonly daily: {
    readonly notOutYet: (puzzleNumber: number) => string;
    readonly archiveTitle: (puzzleNumber: number) => string;
  };
  readonly archive: {
    readonly today: string;
    readonly inProgress: string;
    readonly play: string;
    readonly result: (score: number, verdict: string) => string;
  };
}
