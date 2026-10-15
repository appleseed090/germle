/**
 * Fails if either product's output breaks the rules in CLAUDE.md: `dist/` (germle.com) must hold
 * nothing from the portal, and `dist-portal/` (Germle Endless on CrazyGames) must hold no links
 * and nothing CrazyGames forbids. Also checks that the portal's player-facing English lives in
 * `src/portal/strings.ts`. Run after both builds; `npm run check` does.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  germleComBuildViolations,
  isTextPath,
  portalBuildViolations,
  portalSourceViolations,
  type CheckedFile,
} from './build-rules.ts';

const ROOT = new URL('..', import.meta.url).pathname;

function readTree(
  directory: string,
  keepFile: (path: string) => boolean = () => true,
): CheckedFile[] {
  const absoluteDirectory = join(ROOT, directory);
  if (!existsSync(absoluteDirectory))
    throw new Error(`${directory}/ does not exist; build it first`);
  const files: CheckedFile[] = [];
  const visit = (absolutePath: string): void => {
    for (const entry of readdirSync(absolutePath)) {
      const entryPath = join(absolutePath, entry);
      if (statSync(entryPath).isDirectory()) {
        visit(entryPath);
        continue;
      }
      const path = relative(absoluteDirectory, entryPath).split(sep).join('/');
      if (!keepFile(path)) continue;
      const bytes = readFileSync(entryPath);
      files.push({
        path,
        text: isTextPath(path) ? bytes.toString('utf8') : undefined,
        byteLength: bytes.length,
      });
    }
  };
  visit(absoluteDirectory);
  return files;
}

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
