import '../styles/main.css';
import {
  DAILY_PUZZLE_CONFIG,
  countOutcomes,
  createPuzzle,
  scorePercent,
  startGame,
  type PuzzleConfig,
} from '../engine';
import {
  PRACTICE_RANGES,
  normaliseSeed,
  parsePracticeParameters,
  practiceParameters,
  practiceSeedKey,
  randomSeed,
  type PracticeSetup,
} from '../practice-setup';
import { browserLocalStorage, createGameStorage } from '../storage';
import { openDialog, wireDialog } from '../ui/dialogs';
import { wireDisclosureButtons } from '../ui/disclosure';
import { requireElement } from '../ui/dom';
import { mountGameSession, pluralize } from '../ui/game-session';
import { renderOutcomeBreakdown, renderVerdict } from '../ui/outcome-breakdown';
import { connectSettingsDialog, displayOptionsFor } from '../ui/settings-dialog';
import { createToast } from '../ui/toast';

const RESULTS_DELAY_AFTER_END = 700;

const storage = createGameStorage(browserLocalStorage());
const pageParameters = new URLSearchParams(window.location.search);
const setup = parsePracticeParameters(pageParameters, () => randomSeed());
const practiceUrl = (practice: PracticeSetup): string =>
  `/practice?${practiceParameters(practice).toString()}`;
// Keep the address bar in step with the game being played, so reloading or sharing replays it.
window.history.replaceState(null, '', practiceUrl(setup));

const puzzle = createPuzzle(setup.config, practiceSeedKey(setup.seed));
const toast = createToast(requireElement('toast', HTMLElement));
const resultsDialog = requireElement('results-dialog', HTMLDialogElement);
wireDialog(resultsDialog);

const session = mountGameSession({
  puzzle,
  initialState: startGame(puzzle).state,
  display: displayOptionsFor(storage.loadSettings()),
  toast,
  elements: {
    boardContainer: requireElement('board', HTMLElement),
    outbreakBanner: requireElement('outbreak-banner', HTMLElement),
    phaseLabel: requireElement('phase-label', HTMLElement),
    counter: requireElement('counter', HTMLElement),
    counterSecondary: requireElement('counter-secondary', HTMLElement),
    instruction: requireElement('instruction', HTMLElement),
    toolbarResultsButton: requireElement('toolbar-results', HTMLButtonElement),
    announcer: requireElement('announcer', HTMLElement),
  },
  onMove: () => undefined,
  onGameEnded: (state) => {
    const counts = countOutcomes(state);
    const score = scorePercent(counts);
    requireElement('result-score', HTMLElement).textContent = `${score}%`;
    renderVerdict(requireElement('result-verdict', HTMLElement), score);
    renderOutcomeBreakdown(
      requireElement('breakdown-bar', HTMLElement),
      requireElement('breakdown-legend', HTMLElement),
      counts,
    );
    window.setTimeout(() => {
      openDialog(resultsDialog);
    }, RESULTS_DELAY_AFTER_END);
  },
  onShowResults: () => {
    openDialog(resultsDialog);
  },
});

requireElement('practice-summary', HTMLElement).textContent = describeSetup(setup);
requireElement('play-again', HTMLAnchorElement).href = practiceUrl(setup);
requireElement('new-network', HTMLAnchorElement).href = practiceUrl({
  ...setup,
  seed: randomSeed(),
});

const settingsDialog = connectSettingsDialog(storage, session);
requireElement('open-settings', HTMLButtonElement).addEventListener('click', () => {
  openDialog(settingsDialog);
});

const setupDialog = bindSetupDialog(setup);
requireElement('open-setup', HTMLButtonElement).addEventListener('click', () => {
  openDialog(setupDialog);
});
requireElement('change-setup', HTMLButtonElement).addEventListener('click', () => {
  resultsDialog.close();
  openDialog(setupDialog);
});
// A bare /practice visit starts on the setup; a link with a seed goes straight to the game.
if (!pageParameters.has('seed')) openDialog(setupDialog);

function describeSetup(practice: PracticeSetup): string {
  const { config, seed } = practice;
  return [
    pluralize(config.nodeCount, 'person', 'people'),
    pluralize(config.vaccineCount, 'vaccine', 'vaccines'),
    pluralize(config.indexPatientCount, 'outbreak', 'outbreaks'),
    pluralize(config.refuserCount, 'refuser', 'refusers'),
    `${Math.round(config.transmissionProbability * 100)}% contagious`,
    `seed ${seed}`,
  ].join(' · ');
}

interface SliderBinding {
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
  readonly format: (value: number) => string;
}

function bindSetupDialog(initial: PracticeSetup): HTMLDialogElement {
  const dialog = requireElement('setup-dialog', HTMLDialogElement);
  wireDialog(dialog);
  wireDisclosureButtons(dialog);
  const slider = (
    id: string,
    range: { minimum: number; maximum: number; step: number },
    format: (value: number) => string = String,
  ): SliderBinding => {
    const input = requireElement(`setup-${id}`, HTMLInputElement);
    input.min = String(range.minimum);
    input.max = String(range.maximum);
    input.step = String(range.step);
    return { input, output: requireElement(`setup-${id}-value`, HTMLOutputElement), format };
  };
  const sliders = {
    people: slider('people', PRACTICE_RANGES.nodeCount),
    neighbours: slider('neighbours', PRACTICE_RANGES.ringNeighbourCount),
    vaccines: slider('vaccines', PRACTICE_RANGES.vaccineCount),
    outbreaks: slider('outbreaks', PRACTICE_RANGES.indexPatientCount),
    refusers: slider('refusers', PRACTICE_RANGES.refuserCount),
    contagion: slider('contagion', PRACTICE_RANGES.contagiousnessPercent, (value) => `${value}%`),
  };
  const seedInput = requireElement('setup-seed', HTMLInputElement);

  const showConfig = (config: PuzzleConfig, seed: string): void => {
    sliders.people.input.value = String(config.nodeCount);
    sliders.neighbours.input.value = String(config.ringNeighbourCount);
    sliders.vaccines.input.value = String(config.vaccineCount);
    sliders.outbreaks.input.value = String(config.indexPatientCount);
    sliders.refusers.input.value = String(config.refuserCount);
    sliders.contagion.input.value = String(Math.round(config.transmissionProbability * 100));
    seedInput.value = seed;
    refreshOutputs();
  };
  const refreshOutputs = (): void => {
    for (const { input, output, format } of Object.values(sliders))
      output.value = format(Number(input.value));
  };
  for (const { input } of Object.values(sliders)) input.addEventListener('input', refreshOutputs);

  requireElement('setup-random-seed', HTMLButtonElement).addEventListener('click', () => {
    seedInput.value = randomSeed();
  });
  requireElement('setup-daily-defaults', HTMLButtonElement).addEventListener('click', () => {
    showConfig(
      parsePracticeParameters(new URLSearchParams(), () => seedInput.value).config,
      seedInput.value,
    );
  });
  requireElement('setup-start', HTMLButtonElement).addEventListener('click', () => {
    const seed = normaliseSeed(seedInput.value) ?? randomSeed();
    const draft: PracticeSetup = {
      config: {
        ...DAILY_PUZZLE_CONFIG,
        nodeCount: Number(sliders.people.input.value),
        ringNeighbourCount: Number(sliders.neighbours.input.value),
        vaccineCount: Number(sliders.vaccines.input.value),
        indexPatientCount: Number(sliders.outbreaks.input.value),
        refuserCount: Number(sliders.refusers.input.value),
        transmissionProbability: Number(sliders.contagion.input.value) / 100,
      },
      seed,
    };
    // Round-trip through the URL format so the cross-field limits (vaccines and outbreaks that
    // fit the network) apply exactly as they will on load.
    window.location.assign(
      practiceUrl(parsePracticeParameters(practiceParameters(draft), () => seed)),
    );
  });

  showConfig(initial.config, initial.seed);
  return dialog;
}
