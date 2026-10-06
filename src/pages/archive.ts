import '../styles/main.css';
import { buildArchiveEntries, formatPuzzleDate, type ArchiveEntry } from '../archive';
import { localCalendarDate, puzzleNumberForDate } from '../engine';
import { browserLocalStorage, createGameStorage } from '../storage';
import { requireElement } from '../ui/dom';
import { verdictForScore } from '../verdict';

const storage = createGameStorage(browserLocalStorage());
// A device clock set before launch still lists puzzle #1, as the game page plays it.
const todayPuzzleNumber = Math.max(1, puzzleNumberForDate(localCalendarDate(new Date())));
const dailyProgress = storage.loadDailyProgress();
const unfinishedPuzzleNumbers = new Set(storage.loadArchiveProgress().keys());
if (dailyProgress?.puzzleNumber === todayPuzzleNumber && dailyProgress.moves.length > 0)
  unfinishedPuzzleNumbers.add(todayPuzzleNumber);

const entries = buildArchiveEntries(todayPuzzleNumber, {
  dailyResults: storage.loadResults(),
  archiveResults: storage.loadArchiveResults(),
  unfinishedPuzzleNumbers,
});
requireElement('archive-list', HTMLOListElement).replaceChildren(...entries.map(renderEntry));

function renderEntry(entry: ArchiveEntry): HTMLLIElement {
  const link = document.createElement('a');
  link.className = 'archive-entry';
  link.href = entry.href;

  const number = document.createElement('span');
  number.className = 'archive-number';
  number.textContent = `#${entry.puzzleNumber}`;

  const date = document.createElement('span');
  date.className = 'archive-date';
  date.textContent = entry.isToday ? 'Today' : formatPuzzleDate(entry.date);

  const status = document.createElement('span');
  status.className = 'archive-status';
  if (entry.result !== undefined) {
    const verdict = verdictForScore(entry.result.score);
    status.textContent = `${entry.result.score}% ${verdict}`;
    status.dataset['verdict'] = verdict.toLowerCase();
  } else {
    status.textContent = entry.inProgress ? 'In progress' : 'Play';
    status.dataset['state'] = entry.inProgress ? 'in-progress' : 'unplayed';
  }

  link.append(number, date, status);
  const item = document.createElement('li');
  item.append(link);
  return item;
}
