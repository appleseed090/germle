/**
 * Plays many Germle Endless runs with the greedy bot in `src/endless/simulation.ts` and prints
 * the numbers the balance goals are judged by: levels reached, run length, how fast level 1
 * goes, and how often each upgrade is offered and picked.
 *
 * Usage: `npm run simulate:endless -- [--runs 500] [--pool all|starter] [--second-chance]
 * [--mistakes 0.15] [--random-picks 0.2]`. `--mistakes` is the share of moves the bot makes at
 * random, to model a less careful player than the greedy expert.
 *
 * With `--calibrate`, instead plays each of levels 1–40 on 200 seeds without upgrades and prints
 * the bot's saved share against the pass mark, for tuning the level curves. With
 * `--upgrade-impact <level>`, plays that level on 300 seeds with each upgrade alone (one stack)
 * and prints the bot's pass rate and median saved share against no upgrade at all. With
 * `--career <runs>`, plays that many consecutive runs per simulated player (`--runs` players),
 * buying the cheapest affordable unlocks after each, and prints each run's numbers.
 *
 * The game code is TypeScript with bundler-style imports, so it is loaded through Vite's module
 * runner rather than by Node directly.
 */
import { parseArgs } from 'node:util';
import { runnerImport } from 'vite';

type Simulation = typeof import('../src/endless/simulation.ts');
type Upgrades = typeof import('../src/endless/upgrades.ts');

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '500' },
    pool: { type: 'string', default: 'all' },
    'second-chance': { type: 'boolean', default: false },
    'random-picks': { type: 'string', default: '0.2' },
    mistakes: { type: 'string', default: '0' },
    calibrate: { type: 'boolean', default: false },
    'upgrade-impact': { type: 'string' },
    career: { type: 'string' },
  },
});
const runCount = Number(values.runs);
const randomPickChance = Number(values['random-picks']);
if (!Number.isInteger(runCount) || runCount < 1)
  throw new Error('--runs must be a positive integer');
if (!(randomPickChance >= 0 && randomPickChance <= 1))
  throw new Error('--random-picks must be in [0, 1]');
const mistakeChance = Number(values.mistakes);
if (!(mistakeChance >= 0 && mistakeChance <= 1)) throw new Error('--mistakes must be in [0, 1]');

const root = new URL('..', import.meta.url).pathname;
const load = async <Module>(path: string): Promise<Module> =>
  (await runnerImport<Module>(path, { root, configFile: false, logLevel: 'error' })).module;
const simulation = await load<Simulation>('/src/endless/simulation.ts');
const upgrades = await load<Upgrades>('/src/endless/upgrades.ts');

const research = await load<typeof import('../src/endless/research.ts')>(
  '/src/endless/research.ts',
);
const pools: Record<string, ReadonlySet<import('../src/endless/upgrades.ts').UpgradeId>> = {
  all: new Set(upgrades.UPGRADE_IDS),
  starter: research.unlockedUpgrades([]),
};
const unlocked = pools[values.pool];
if (unlocked === undefined)
  throw new Error(`--pool must be one of ${Object.keys(pools).join(', ')}`);

const percent = (value: number): string => `${(100 * value).toFixed(1)}%`;

if (values.calibrate) {
  console.log('Level  people  pass  saved p25 / median / p75   pass rate  taps');
  for (let level = 1; level <= 40; level++) {
    const c = simulation.calibrateLevel(level, [], 200);
    console.log(
      `${String(level).padStart(5)} ${String(c.nodeCount).padStart(7)} ${String(c.passThresholdPercent).padStart(5)}  ${String(c.savedPercent.p25).padStart(9)} / ${String(c.savedPercent.median).padStart(6)} / ${String(c.savedPercent.p75).padStart(3)}   ${(100 * c.passRate).toFixed(0).padStart(8)}%  ${String(c.moves.median).padStart(4)}`,
    );
  }
  process.exit(0);
}

if (values['upgrade-impact'] !== undefined) {
  const level = Number(values['upgrade-impact']);
  const seeds = 300;
  const baseline = simulation.calibrateLevel(level, [], seeds);
  console.log(
    `Level ${level}: no upgrade passes ${(100 * baseline.passRate).toFixed(0)}%, median saved ${baseline.savedPercent.median}% (pass mark ${baseline.passThresholdPercent}%)`,
  );
  console.log('Upgrade                pass rate   change  median saved');
  for (const id of upgrades.UPGRADE_IDS) {
    const c = simulation.calibrateLevel(level, [id], seeds);
    console.log(
      `${id.padEnd(22)} ${(100 * c.passRate).toFixed(0).padStart(8)}%  ${(100 * (c.passRate - baseline.passRate)).toFixed(0).padStart(6)}  ${String(c.savedPercent.median).padStart(11)}%`,
    );
  }
  process.exit(0);
}

if (values.career !== undefined) {
  const careerLength = Number(values.career);
  const careers = Array.from({ length: runCount }, (_, index) =>
    simulation.simulateCareer(`career${index}`, careerLength, {
      takesSecondChance: values['second-chance'],
      randomPickChance,
      maximumLevels: 200,
      mistakeChance,
    }),
  );
  console.log(
    `${runCount} players × ${careerLength} runs · mistakes ${percent(mistakeChance)} · second chance ${values['second-chance'] ? 'taken' : 'not taken'}`,
  );
  console.log(
    'Run  levels p25/median/p75/p90   minutes median   Research median   ≥1 unlock before',
  );
  for (let index = 0; index < careerLength; index++) {
    const runsAt = careers.map((career) => career[index]).filter((run) => run !== undefined);
    const report = simulation.summariseRuns(runsAt.map(({ run }) => run));
    const researchEarned = runsAt.map(({ researchEarned }) => researchEarned).sort((a, b) => a - b);
    const unlocked = runsAt.filter(({ unlocksBefore }) => unlocksBefore.length > 0).length;
    console.log(
      `${String(index + 1).padStart(3)}  ${[report.levelsCleared.p25, report.levelsCleared.median, report.levelsCleared.p75, report.levelsCleared.p90].join(' / ').padStart(22)}   ${report.estimatedMinutes.median.toFixed(1).padStart(14)}   ${String(researchEarned[Math.floor(researchEarned.length / 2)]).padStart(15)}   ${percent(unlocked / runsAt.length).padStart(16)}`,
    );
  }
  process.exit(0);
}

const started = performance.now();
const runs = Array.from({ length: runCount }, (_, index) =>
  simulation.simulateRun(`sim${String(index).padStart(5, '0')}`, {
    unlocked,
    start: { startingPicks: [], freeRerolls: 0 },
    takesSecondChance: values['second-chance'],
    randomPickChance,
    maximumLevels: 200,
    offerCount: 3,
    mistakeChance,
  }),
);
const report = simulation.summariseRuns(runs);
const elapsedSeconds = (performance.now() - started) / 1000;

const format = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);
const row = (label: string, p: import('../src/endless/simulation.ts').Percentiles): string =>
  `${label.padEnd(22)} mean ${format(p.mean).padStart(6)}  p10 ${format(p.p10).padStart(5)}  p25 ${format(p.p25).padStart(5)}  median ${format(p.median).padStart(5)}  p75 ${format(p.p75).padStart(5)}  p90 ${format(p.p90).padStart(5)}  max ${format(p.maximum).padStart(5)}`;

console.log(
  `${report.runs} runs · pool ${values.pool} · mistakes ${percent(mistakeChance)} · second chance ${values['second-chance'] ? 'taken' : 'not taken'} · random picks ${percent(randomPickChance)} · ${elapsedSeconds.toFixed(1)} s`,
);
console.log(row('Levels cleared', report.levelsCleared));
console.log(row('Est. minutes per run', report.estimatedMinutes));
console.log(row('Taps per run', report.moves));
console.log(row('Taps on level 1', report.firstLevelMoves));
console.log(`Cleared level 1: ${percent(report.clearedFirstLevelShare)}`);
console.log(`Reached level 20: ${percent(report.reachedLevel20Share)}`);
const hazards: string[] = [];
for (let level = 1; level <= report.levelsCleared.maximum + 1; level++) {
  const reached = runs.filter((run) => run.levelsCleared >= level - 1).length;
  const ended = runs.filter((run) => run.levelsCleared === level - 1).length;
  if (reached > 0) hazards.push(`${level}:${Math.round((100 * ended) / reached)}`);
}
console.log(`Runs ending at each level, % of those reaching it: ${hazards.join(' ')}`);
console.log('Upgrade                offered   picked  pick rate  share of picks');
for (const upgrade of report.upgrades)
  console.log(
    `${upgrade.id.padEnd(22)} ${String(upgrade.offered).padStart(7)} ${String(upgrade.picked).padStart(8)} ${percent(upgrade.pickRate).padStart(10)} ${percent(upgrade.pickShare).padStart(15)}`,
  );
