import { pluralize } from '../pluralize';
import type { Messages } from './messages';

const COUNT_FORMAT = new Intl.NumberFormat('en-US');
const formatCount = (count: number): string => COUNT_FORMAT.format(count);

/** English, the language the page shells are written in. */
export const en: Messages = {
  shell: undefined,
  verdicts: { Contained: 'Contained', Spread: 'Spread' },
  verdictRule: {
    contained: (threshold) => `: ${threshold}% or more saved.`,
    spread: (threshold) => `: below ${threshold}%.`,
    separator: ' ',
  },
  summary: {
    people: (count) => pluralize(count, 'person', 'people'),
    vaccines: (count) => pluralize(count, 'vaccine', 'vaccines'),
    outbreaks: (count) => pluralize(count, 'outbreak', 'outbreaks'),
    refusers: (count) => pluralize(count, 'refuser', 'refusers'),
    contagious: (percent) => `${percent}% contagious`,
    seed: (seed) => `seed ${seed}`,
    everyDailyPuzzle: (summary) => `Every daily puzzle: ${summary}`,
  },
  game: {
    phaseVaccinate: 'Vaccinate',
    phaseQuarantine: 'Quarantine',
    vaccinesLeft: (count) => `${pluralize(count, 'vaccine', 'vaccines')} left`,
    vaccinateInstruction: (vaccineCount) =>
      `Vaccinate ${pluralize(vaccineCount, 'person', 'people')} to break up the network`,
    quarantinedCount: (count) => `${count} quarantined`,
    infectedCount: (count) => `${count} infected`,
    quarantineInstruction:
      'Tap a healthy person to quarantine them. Each quarantine passes one day.',
    percentSaved: (score) => `${score}% saved`,
    endedInstruction: 'The outbreak has nowhere left to go.',
    alreadyInfected: 'Already infected. Quarantine a healthy person.',
    refusesVaccines: 'This person refuses vaccines.',
    announceVaccinated: (person, vaccinesLeft) =>
      `Vaccinated person ${person}. ${pluralize(vaccinesLeft, 'vaccine', 'vaccines')} left.`,
    announceOutbreak: (people) =>
      `Outbreak! ${people.map((person) => `Person ${person}`).join(' and ')} infected.`,
    announceQuarantined: (person) => `Quarantined person ${person}.`,
    announceSpread: (day, newInfections) =>
      `Day ${day}: ${pluralize(newInfections, 'new infection', 'new infections')}.`,
    announceEnded: (verdict, score) => `Outbreak ${verdict.toLowerCase()}. ${score}% saved.`,
    boardLabel: 'Social network',
    describePerson: (person, status, refusesVaccines, contacts) => {
      const statusText = status === 'susceptible' ? 'healthy' : status;
      const refusal = refusesVaccines ? ', refuses vaccines' : '';
      return `Person ${person}: ${statusText}${refusal}, ${pluralize(contacts, 'contact', 'contacts')}`;
    },
  },
  results: {
    copied: 'Copied to clipboard',
    finishThisPuzzle: 'Finish this puzzle to see your score.',
  },
  community: {
    rank: (percentBeaten, players) =>
      `Better than ${percentBeaten}% of ${formatCount(players)} players`,
    topScore: (best) => `Top score so far: ${best}%`,
    reachedBy: (players) =>
      `reached by ${formatCount(players)} ${players === 1 ? 'player' : 'players'}`,
    band: (band, players, isYours) =>
      `${band}%: ${pluralize(players, 'player', 'players')}${isYours ? ', your score' : ''}`,
    you: 'You',
  },
  daily: {
    notOutYet: (puzzleNumber) => `Puzzle #${puzzleNumber} isn't out yet. Here's today's.`,
    archiveTitle: (puzzleNumber) => `Germle #${puzzleNumber} — from the archive`,
  },
  archive: {
    today: 'Today',
    inProgress: 'In progress',
    play: 'Play',
    result: (score, verdict) => `${score}% ${verdict}`,
  },
};
