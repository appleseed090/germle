/**
 * Proves that the germle.com build is byte-for-byte what another commit builds (by default
 * `origin/main`): builds that commit in a temporary git worktree, builds the working tree, and
 * compares every file of the two `dist/` outputs by SHA-256.
 *
 * Usage: `npm run compare:germle-com [-- <git ref>]`. Exits 1 and lists the differing files if
 * any byte differs. Not part of `npm run check`, since a germle.com change is expected to differ;
 * run it before merging portal work to show that germle.com is untouched.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const reference = process.argv[2] ?? 'origin/main';

function run(command: string, args: readonly string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
}

function hashTree(directory: string): Map<string, string> {
  const hashes = new Map<string, string>();
  const visit = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const entryPath = join(path, entry);
      if (statSync(entryPath).isDirectory()) visit(entryPath);
      else
        hashes.set(
          relative(directory, entryPath),
          createHash('sha256').update(readFileSync(entryPath)).digest('hex'),
        );
    }
  };
  visit(directory);
  return hashes;
}

const scratch = mkdtempSync(join(tmpdir(), 'germle-compare-'));
const worktree = join(scratch, 'reference');
try {
  run('git', ['worktree', 'add', '--detach', worktree, reference], ROOT);
  symlinkSync(join(ROOT, 'node_modules'), join(worktree, 'node_modules'));
  run('npx', ['vite', 'build', '--logLevel', 'warn'], worktree);
  run('npx', ['vite', 'build', '--logLevel', 'warn'], ROOT);
  const expected = hashTree(join(worktree, 'dist'));
  const actual = hashTree(join(ROOT, 'dist'));
  const differences = [...new Set([...expected.keys(), ...actual.keys()])]
    .filter((path) => expected.get(path) !== actual.get(path))
    .sort();
  if (differences.length > 0) {
    console.error(`dist/ differs from ${reference} in ${differences.length} file(s):`);
    for (const path of differences) console.error(`  ${path}`);
    process.exitCode = 1;
  } else {
    console.log(`dist/ is byte-for-byte identical to ${reference} (${actual.size} files).`);
  }
} finally {
  run('git', ['worktree', 'remove', '--force', worktree], ROOT);
  rmSync(scratch, { recursive: true, force: true });
}
