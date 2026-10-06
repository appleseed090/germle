import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { build, defineConfig, type Plugin } from 'vite';

const THEME_BEFORE_PAINT_ENTRY = 'src/theme-before-paint.ts';

/**
 * Adds `src/theme-before-paint.ts` to the end of every page's `<head>` as a classic script, which
 * blocks the first paint until a saved theme is applied. The CSP forbids inline scripts, and Vite
 * only bundles module scripts (which are deferred), so the build bundles the entry on its own into a
 * self-contained IIFE with a content hash under `assets/`, where `_headers` caches it as immutable.
 * The dev server loads it as a module instead, so a saved theme may flash there.
 */
function themeBeforePaintScript(): Plugin {
  let root = process.cwd();
  let isBuild = false;
  let scriptUrl = `/${THEME_BEFORE_PAINT_ENTRY}`;
  return {
    name: 'germle:theme-before-paint',
    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
    },
    async buildStart() {
      if (!isBuild) return;
      const result = await build({
        configFile: false,
        root,
        publicDir: false,
        logLevel: 'warn',
        build: {
          write: false,
          modulePreload: false,
          rollupOptions: { input: THEME_BEFORE_PAINT_ENTRY, output: { format: 'iife' } },
        },
      });
      const outputs = Array.isArray(result) ? result : [result];
      const chunk = outputs
        .flatMap((output) => ('output' in output ? output.output : []))
        .find((item) => item.type === 'chunk');
      if (chunk === undefined) throw new Error(`No chunk built from ${THEME_BEFORE_PAINT_ENTRY}`);
      const hash = createHash('sha256').update(chunk.code).digest('hex').slice(0, 8);
      const fileName = `assets/theme-${hash}.js`;
      this.emitFile({ type: 'asset', fileName, source: chunk.code });
      scriptUrl = `/${fileName}`;
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: isBuild ? { src: scriptUrl } : { type: 'module', src: scriptUrl },
          injectTo: 'head',
        },
      ];
    },
  };
}

/**
 * The headers `public/_headers` gives every path (`/*`), so `vite preview` (and the end-to-end
 * tests it serves) runs under the production Content-Security-Policy.
 *
 * @throws Error if the file has no `/*` block, so a format change fails the preview, not silently.
 */
function productionHeadersForAllPaths(): Record<string, string> {
  const lines = readFileSync(new URL('public/_headers', import.meta.url), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === '/*');
  if (start === -1) throw new Error('public/_headers has no /* block');
  const headers: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line) || line.trim() === '') break;
    const separator = line.indexOf(':');
    headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return headers;
}

export default defineConfig({
  plugins: [themeBeforePaintScript()],
  preview: { headers: productionHeadersForAllPaths() },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/shared-[hash].js',
      },
      input: {
        daily: 'index.html',
        about: 'about.html',
        archive: 'archive.html',
        practice: 'practice.html',
      },
    },
  },
});
