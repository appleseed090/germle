/**
 * The CrazyGames cover artwork: a large network mid-outbreak, drawn by the real board, with the
 * title as the only text (CrazyGames allows no other). `scripts/package-portal.ts` opens
 * `portal/cover.html` at each cover size and screenshots it; it is never part of the game build.
 */
import '../styles/main.css';
import './portal.css';
import { requireElement } from '../ui/dom';
import { mountScene, outbreakScene } from './backdrop';
import { element } from './dom';
import { STRINGS } from './strings';

const cover = requireElement('cover', HTMLElement);
const stage = element('div', { className: 'cover-stage' });
cover.append(stage, element('h1', { className: 'cover-title', text: STRINGS.title }));
mountScene(stage, outbreakScene(20, 0.3), 'cover-board');
cover.dataset['ready'] = 'true';
