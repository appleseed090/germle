/**
 * Entry point of Germle Endless, the CrazyGames build (`portal/index.html`). Never imported by
 * germle.com code; ESLint and `scripts/check-builds.ts` enforce that.
 */
import { requireElement } from '../ui/dom';

requireElement('portal-app', HTMLElement).dataset['ready'] = 'true';
