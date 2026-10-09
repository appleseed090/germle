import type { CommunityStanding } from '../community-api';
import {
  communityChartBands,
  describeRank,
  describeTopScore,
  isStandingShown,
  type ChartBand,
} from '../community';
import type { Messages } from '../i18n/messages';
import { requireElement } from './dom';

/**
 * Binds the community comparison in the results dialog: how the player's score ranks among
 * everyone who played the puzzle, the top score so far, and a chart of everyone's scores with the
 * player's band marked "You". It sits below Share, so revealing it when numbers arrive never
 * moves the button.
 *
 * @returns Shows numbers for a score, or hides the section for `undefined` or too few players.
 */
export function bindCommunityComparison(
  text: Messages['community'],
): (standing: CommunityStanding | undefined, score: number) => void {
  const section = requireElement('community', HTMLElement);
  const rank = requireElement('community-rank', HTMLElement);
  const topScore = requireElement('community-top-score', HTMLElement);
  const chart = requireElement('community-chart', HTMLOListElement);
  return (standing, score) => {
    if (!isStandingShown(standing)) {
      section.hidden = true;
      return;
    }
    rank.textContent = describeRank(standing, text);
    const [best, reachedBy] = describeTopScore(standing, text);
    const reachedByPhrase = document.createElement('span');
    reachedByPhrase.className = 'community-reached-by';
    reachedByPhrase.textContent = reachedBy;
    topScore.replaceChildren(best, ' · ', reachedByPhrase);
    chart.replaceChildren(
      ...communityChartBands(standing, score).map((band) => renderChartBand(band, text)),
    );
    section.hidden = false;
  };
}

function renderChartBand(band: ChartBand, text: Messages['community']): HTMLLIElement {
  const column = document.createElement('li');
  column.className = band.isPlayersBand ? 'community-band community-band--yours' : 'community-band';
  const track = document.createElement('span');
  track.className = 'community-bar-track';
  const bar = document.createElement('span');
  bar.className = 'community-bar';
  bar.style.height = `${band.heightPercent}%`;
  track.append(bar);
  const description = document.createElement('span');
  description.className = 'visually-hidden';
  description.textContent = text.band(band.label, band.players, band.isPlayersBand);
  const marker = document.createElement('span');
  marker.className = 'community-band-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = band.isPlayersBand ? text.you : '';
  column.append(track, description, marker);
  return column;
}
