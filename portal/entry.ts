// The page's module entry. Vite serves `portal/` as the site root, so the page cannot point at
// `src/` directly in development; this file bridges to the real entry.
import '../src/portal/main';
