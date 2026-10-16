/**
 * Every English string Germle Endless shows or announces, in one place (a CrazyGames
 * requirement; `scripts/check-builds.ts` fails if player text appears in another portal file).
 * The tone stays PEGI 12 and general-audience: the outbreak is abstract, nobody is hurt.
 */
import { UPGRADE_BALANCE } from '../endless/balance';
import type { StartingBonusId } from '../endless/research';
import type { UpgradeId, UpgradeRarity } from '../endless/upgrades';

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const STRINGS = Object.freeze({
  title: 'Germle Endless',
  tagline: 'Contain one outbreak after another. How far can you go?',

  home: {
    play: 'Play',
    continueRun: (level: number) => `Continue · level ${level}`,
    newRun: 'New run',
    research: 'Research',
    settings: 'Settings',
    bestRun: (levels: number, saved: number) =>
      `Best run: ${plural(levels, 'level', 'levels')} · ${saved} saved`,
    researchToSpend: (research: number) => `${research} Research to spend`,
  },

  hud: {
    level: (level: number) => `Level ${level}`,
    target: (percent: number) => `Save ${percent}%`,
    stillHealthy: (percent: number, target: number) =>
      `${percent}% can still be saved · need ${target}%`,
    vaccinate: 'Vaccinate',
    quarantine: 'Quarantine',
    done: 'Done',
    vaccinesLeft: (count: number) => `${plural(count, 'vaccine', 'vaccines')} left`,
    day: (day: number, quarantined: number) => `Day ${day} · ${quarantined} quarantined`,
    quarantinesLeftToday: (count: number) =>
      `${plural(count, 'quarantine', 'quarantines')} before the day passes`,
    infected: (count: number) => `${count} infected`,
    instructionVaccinate: 'Vaccinate people to break up the network',
    instructionQuarantine: 'Quarantine healthy people. Each quarantine passes a day.',
    instructionDone: 'The outbreak has nowhere left to go.',
    undo: (left: number) => `Undo (${left})`,
    menu: 'Menu',
    upgradesHeading: 'Upgrades',
    noUpgrades: 'Clear a level to choose your first upgrade.',
    stacks: (name: string, count: number) => (count > 1 ? `${name} ×${count}` : name),
  },

  hints: {
    vaccinate: 'Tap people to vaccinate them',
    quarantine: 'Tap healthy people to quarantine them',
  },

  board: {
    outbreak: 'Outbreak!',
    networkLabel: 'Social network',
  },

  toasts: {
    refuser: 'This person refuses vaccines.',
    alreadyInfected: 'Already infected. Quarantine a healthy person.',
    knownPatient: 'Patient zero is already carrying it. Vaccines won’t help.',
    adUnavailable: 'No video available right now.',
    naturallyImmune: (count: number) =>
      count === 1
        ? '1 person starts immune: the dashed circle'
        : `${count} people start immune: the dashed circles`,
    undone: 'Move undone.',
  },

  intro: {
    level: (level: number) => `Level ${level}`,
    details: (people: number, outbreaks: number, target: number) =>
      `${people} people · ${plural(outbreaks, 'outbreak', 'outbreaks')} · save ${target}%`,
  },

  summary: {
    passed: 'Contained!',
    failed: 'The outbreak spread',
    saved: (percent: number, target: number) => `${percent}% saved · needed ${target}%`,
    closeCall: 'Close call!',
    soClose: (points: number) => `So close: ${plural(points, 'point', 'points')} short`,
    breakdown: (vaccinated: number, quarantined: number, untouched: number, infected: number) =>
      `${vaccinated} vaccinated · ${quarantined} quarantined · ${untouched} untouched · ${infected} infected`,
    continue: 'Choose an upgrade',
    secondChance: 'Replay this level (watch a video)',
    secondChanceNote: 'One second chance per run.',
    endRun: 'End run',
  },

  choice: {
    heading: 'Choose an upgrade',
    rerollFree: 'Reroll (free)',
    rerollWithAd: 'Reroll (watch a video)',
    owned: (count: number) => `You have ${count}`,
    nothingLeft: 'You have every upgrade. Onward!',
    skip: 'Next level',
    rarity: {
      common: 'Common',
      uncommon: 'Uncommon',
      rare: 'Rare',
    } satisfies Record<UpgradeRarity, string>,
  },

  runOver: {
    heading: 'Run over',
    levelsCleared: (levels: number) => `${plural(levels, 'level', 'levels')} cleared`,
    peopleSaved: (people: number) => `${people} people saved`,
    newBest: 'New best run!',
    best: (levels: number) => `Best: ${plural(levels, 'level', 'levels')}`,
    researchEarned: (research: number) => `+${research} Research`,
    playAgain: 'Play again',
    research: 'Research',
    home: 'Home',
  },

  research: {
    heading: 'Research',
    intro: 'Every run earns Research. Spend it on new upgrades and starting bonuses.',
    balance: (research: number) => `${research} Research`,
    unlock: (cost: number) => `Unlock · ${cost}`,
    unlocked: 'Unlocked',
    upgradeTag: 'Upgrade',
    bonusTag: 'Starting bonus',
    back: 'Back',
  },

  pause: {
    heading: 'Paused',
    resume: 'Resume',
    settings: 'Settings',
    quit: 'End this run',
    confirmQuit: 'End this run? Its cleared levels still count.',
    confirm: 'End run',
    cancel: 'Keep playing',
  },

  settings: {
    heading: 'Settings',
    sound: 'Sound',
    skipAnimations: 'Skip animations',
    contactCounts: 'Show contact numbers',
    contactCountsHint: 'The number on each person counts their contacts still in the network.',
    done: 'Done',
  },

  ads: {
    simulatedMidgame: 'Ad break (simulated)',
    simulatedRewarded: 'Video ad (simulated)',
  },

  announce: {
    vaccinated: (person: number, left: number) =>
      `Vaccinated person ${person}. ${plural(left, 'vaccine', 'vaccines')} left.`,
    outbreak: (people: readonly number[]) =>
      `Outbreak! ${people.map((person) => `Person ${person}`).join(' and ')} infected.`,
    quarantined: (person: number) => `Quarantined person ${person}.`,
    spread: (day: number, infections: number) =>
      `Day ${day}: ${plural(infections, 'new infection', 'new infections')}.`,
    ended: (percent: number) => `Outbreak over. ${percent}% saved.`,
    atRisk: (count: number) => `${plural(count, 'person', 'people')} at risk tomorrow.`,
  },

  upgrades: {
    'extra-vaccine': { name: 'Extra Vaccine', description: 'One more vaccine every level.' },
    masks: {
      name: 'Masks',
      description: `The outbreak spreads ${String(Math.round((1 - UPGRADE_BALANCE.transmissionMultiplierPerMask) * 100))}% less easily.`,
    },
    'safety-margin': {
      name: 'Safety Margin',
      description: `Lowers the Save target by ${String(UPGRADE_BALANCE.passThresholdPointsPerSafetyMargin)} points every level.`,
    },
    'natural-immunity': {
      name: 'Natural Immunity',
      description: `${plural(UPGRADE_BALANCE.immunePeoplePerStack, 'random person starts', 'random people start')} every level immune.`,
    },
    'rapid-response': {
      name: 'Rapid Response',
      description: 'Your first quarantine each level passes no day.',
    },
    outreach: {
      name: 'Outreach',
      description: 'Nobody refuses vaccines, and as many people start immune.',
    },
    'smaller-outbreak': {
      name: 'Smaller Outbreak',
      description: 'One fewer patient zero each level (at least one).',
    },
    'contact-tracing': {
      name: 'Contact Tracing',
      description: 'See who the outbreak will reach tomorrow.',
    },
    'ring-vaccination': {
      name: 'Ring Vaccination',
      description: 'People next to the vaccinated are half as likely to catch it.',
    },
    'early-warning': {
      name: 'Early Warning',
      description: 'See where the outbreak will start before you vaccinate.',
    },
    'double-shift': { name: 'Double Shift', description: 'Two quarantines per day.' },
    'second-opinion': { name: 'Second Opinion', description: 'Undo one move each level.' },
    burnout: {
      name: 'Burnout',
      description: 'On a lucky day, the outbreak reaches nobody at all.',
    },
  } satisfies Record<UpgradeId, { name: string; description: string }>,

  bonuses: {
    'spare-reroll': { name: 'Spare Reroll', description: 'One free reroll every run.' },
    'head-start': { name: 'Head Start', description: 'Start every run with a common upgrade.' },
    'wider-choice': { name: 'Wider Choice', description: 'Choose from four upgrades, not three.' },
  } satisfies Record<StartingBonusId, { name: string; description: string }>,
});
