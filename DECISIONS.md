# Decisions

One line per choice, newest at the bottom of each section, with the reason. Decisions fixed by the
brief are not repeated here.

## Tooling

- **TypeScript 6.0, not 7.0.** typescript-eslint 8.71 supports TypeScript `<6.1`; 7.0 (the native
  port) would break type-aware linting.
- **Node 24 in `.node-version`.** Current LTS major on 2026-10-04 (Node 26 is not LTS yet).
- **Two tsconfigs.** `tsconfig.json` covers browser code (DOM + Vite types);
  `tsconfig.node.json` covers config files, scripts and e2e (Node types). Mixing both type sets
  in one program makes timers and globals ambiguous.
- **`npm run lint` also runs `prettier --check`.** One gate for style, so `npm run check` covers it.
- **System font stack, no webfont.** Zero bytes and no layout shift; the budget is 100 KB total.
- **GitHub Actions pinned to `actions/checkout@v5` and `actions/setup-node@v5`.** Both run on the
  Node 24 Actions runtime.

## Hosting

- **www → apex is a Cloudflare zone Redirect Rule, not a `_redirects` line.** Pages `_redirects`
  matches paths only and does not support domain-level redirects, so the line in the brief would
  be ignored. `public/_redirects` explains this; `DEPLOY.md` step 4 has the rule.
- **CSP allows Cloudflare Web Analytics hosts.** `static.cloudflareinsights.com` (script) and
  `cloudflareinsights.com` (beacon) so enabling analytics later needs no code change.
- **Long immutable cache only on `/assets/*`.** Vite content-hashes everything there; HTML and
  root files (`/og.png`, icons, manifest) keep Cloudflare's default revalidation.

## Credits

- **Footer name is "Jonathan Liu".** The brief says to use the git author name; in this
  environment the local git author is the coding agent, so the name comes from the repo owner's
  GitHub profile (`appleseed090`).
