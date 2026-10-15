/**
 * Fails if either product's output breaks the rules in CLAUDE.md: `dist/` (germle.com) must hold
 * nothing from the portal, and `dist-portal/` (Germle Endless on CrazyGames) must hold no links
 * and nothing CrazyGames forbids. Also checks that the portal's player-facing English lives in
 * `src/portal/strings.ts`. Run after both builds; `npm run check` does.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  germleComBuildViolations,
  portalBuildViolations,
  portalSourceViolations,
} from './build-rules.ts';
import { readFileTree } from './file-tree.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const readTree = (directory: string, keepFile?: (path: string) => boolean) =>
  readFileTree(ROOT, directory, keepFile);

const isPortalSource = (path: string): boolean =>
  path.endsWith('.ts') && !path.endsWith('.test.ts');

const violations = [
  ...germleComBuildViolations(readTree('dist')),
  ...portalBuildViolations(readTree('dist-portal')),
  ...portalSourceViolations(
    ['src/portal', 'src/endless']
      .filter((directory) => existsSync(join(ROOT, directory)))
      .flatMap((directory) =>
        readTree(directory, isPortalSource).map((file) => ({
          ...file,
          path: `${directory}/${file.path}`,
        })),
      ),
  ),
];

if (violations.length > 0) {
  console.error(`Build rules broken (${violations.length}):`);
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log('Build rules hold: dist/ has nothing from the portal; dist-portal/ is clean.');
