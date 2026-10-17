/**
 * Fails if either product's output breaks the rules in CLAUDE.md: `dist/` (germle.com) must hold
 * nothing from the portal, and both Germle Endless builds (`dist-portal/` for CrazyGames' Basic
 * Launch, `dist-portal-full/` for Full Launch) must hold no links and nothing CrazyGames forbids.
 * Also checks that the portal's player-facing English lives in `src/portal/strings.ts`. Run after
 * all three builds; `npm run check` does.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  basicLaunchBuildViolations,
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
  ...basicLaunchBuildViolations(readTree('dist-portal')),
  ...portalBuildViolations(readTree('dist-portal-full')).map((violation) =>
    violation.replaceAll('dist-portal/', 'dist-portal-full/'),
  ),
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
console.log(
  'Build rules hold: dist/ has nothing from the portal; dist-portal/ and dist-portal-full/ are clean.',
);
