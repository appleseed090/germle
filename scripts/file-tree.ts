import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isTextPath, type CheckedFile } from './build-rules.ts';

/**
 * Every file under `directory` (relative to `root`), with paths relative to `directory` in
 * forward slashes, and text read for text files.
 *
 * @throws Error if the directory does not exist (usually: build it first).
 */
export function readFileTree(
  root: string,
  directory: string,
  keepFile: (path: string) => boolean = () => true,
): (CheckedFile & { readonly bytes: Buffer })[] {
  const absoluteDirectory = join(root, directory);
  if (!existsSync(absoluteDirectory))
    throw new Error(`${directory}/ does not exist; build it first`);
  const files: (CheckedFile & { readonly bytes: Buffer })[] = [];
  const visit = (absolutePath: string): void => {
    for (const entry of readdirSync(absolutePath).sort()) {
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
        bytes,
        text: isTextPath(path) ? bytes.toString('utf8') : undefined,
        byteLength: bytes.length,
      });
    }
  };
  visit(absoluteDirectory);
  return files;
}
