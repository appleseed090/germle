# Deploying Germle

Germle is a static site, served by Cloudflare as Workers static assets: an assets-only Worker
with no script, configured in `wrangler.jsonc`. Workers Builds builds it from `main` on every
push. Nothing in the repo holds secrets, and the build needs no environment variables.

These steps need someone logged in to the Cloudflare and Porkbun accounts. Do them in order.

## Checklist

- [x] 0. Make `main` the default branch on GitHub
- [x] 1. Connect the repo to Cloudflare Workers
- [x] 2. Move DNS for `germle.com` to Cloudflare
- [x] 3. Point Porkbun's nameservers at Cloudflare
- [x] 4. Attach `germle.com` and `www.germle.com` to the Worker, and add the www → apex redirect rule
- [x] 5. Verify (2026-10-05; the `workers.dev` address was not checked)
- [ ] 6. Optional: Web Analytics and preview deployments. Previews work (2026-10-05); Web
      Analytics is not on: the live page has no Cloudflare beacon script.

## 0. Make `main` the default branch

The first branch pushed to the empty repo was the agent's working branch, so GitHub made it the
default. GitHub → `germle` → **Settings** → **General** → **Default branch** → switch to `main`.
Then delete `claude/ecstatic-volta-wr90cz` under **Branches** if you like. Cloudflare only cares
about the branch you pick in step 1, so this is housekeeping, not a blocker.

## 1. Connect the repo

Cloudflare dashboard → **Workers & Pages** → **Create application** → **Connect GitHub** →
authorise GitHub (choose **Only select repositories** → `germle`) → select `germle`.

| Setting               | Value                                            |
| --------------------- | ------------------------------------------------ |
| Project name          | `germle` (must match `name` in `wrangler.jsonc`) |
| Build command         | `npm run build`                                  |
| Deploy command        | `npx wrangler deploy` (the default)              |
| Non-production deploy | `npx wrangler preview` (the default)             |
| Root directory / path | `/` (leave blank)                                |
| Environment variables | none                                             |
| Node version          | read from `.node-version`                        |

Deploy. The production branch is the repo's default branch, which is why step 0 comes first; if
it shows another branch, change it under the Worker's **Settings** → **Build** → **Branch
control**. When the build finishes, open the `germle.<your-subdomain>.workers.dev` address it
shows.

## 2. Move DNS to Cloudflare

Custom domains on a Worker need the domain's DNS on Cloudflare.

Cloudflare → **Onboard a domain** (older dashboards: **Add a site**) → `germle.com` → **Free**
plan. When it offers
to import existing DNS records, **delete every imported record** (they are Porkbun's parking
page). Note the two nameservers Cloudflare assigns (they look like `name.ns.cloudflare.com`).

## 3. Point Porkbun at Cloudflare

First check DNSSEC is off: Porkbun → **Domain Management** → `germle.com` → **DNSSEC**. If it
is on, turn it off and wait an hour before the nameserver change, or the domain stops resolving.
You can turn DNSSEC back on later from Cloudflare (**DNS** → **Settings**).

Porkbun → **Domain Management** → `germle.com` → **Nameservers** (pencil icon) → replace the four
`*.ns.porkbun.com` entries with the two Cloudflare ones. Alternatively use Porkbun's
**Your Cloudflare → Connect** button, which should end in the same nameserver change.

Propagation is usually minutes, up to 24 hours. Cloudflare emails you when the zone is active.
Domain lock and auto-renew can stay on; changing nameservers does not need the lock removed.

## 4. Attach the domains to the Worker

Wait until the zone shows **Active** (step 3). Then **Workers & Pages** → `germle` → **Settings**
→ **Domains & Routes** → **Add** → **Custom domain** → `germle.com`. Repeat for
`www.germle.com`. Cloudflare creates the DNS records and certificates itself; each domain shows
**Active** after a few minutes. Deploys from `wrangler.jsonc` leave these domains alone because
the file declares no routes.

**www → apex redirect.** The brief planned this as a line in `public/_redirects`, but Cloudflare's
`_redirects` only matches paths and does not support domain-level redirects, so it has to be a
zone rule (one-time, no code). Redirect Rules run before the Worker:

Cloudflare → `germle.com` zone → **Rules** → **Overview** → **Templates** → **Redirect from WWW
to Root** → **Create rule**. The template fills in:

| Field                      | Value                                         |
| -------------------------- | --------------------------------------------- |
| If incoming requests match | Wildcard pattern, request URL `https://www.*` |
| Then: target URL           | `https://${1}`                                |
| Status code                | `301`                                         |
| Preserve query string      | on                                            |

Deploy the rule. It only fires if the `www` DNS record is proxied (orange cloud), which it is when
the custom domain was added in the step above.

**Always use HTTPS.** `germle.com` zone → **SSL/TLS** → **Edge Certificates** → turn on **Always
Use HTTPS**, so plain `http://` visits are redirected before the HSTS header can take over.

## 5. Verify

- `https://germle.com` loads with a valid certificate, and `http://germle.com` redirects to it.
- `https://www.germle.com/anything` redirects (301) to `https://germle.com/anything`.
  From a terminal: `curl -sI https://www.germle.com/anything | grep -i -E '^(HTTP|location)'`
- The `germle.<your-subdomain>.workers.dev` address still works.
- Response headers include the security headers from `public/_headers`:
  `curl -sI https://germle.com | grep -i content-security-policy`

## 6. Optional

- **Web Analytics:** Cloudflare → **Analytics & Logs** → **Web Analytics** → add `germle.com`
  with **automatic setup**. No code change is needed: Cloudflare injects its beacon script, and
  the Content-Security-Policy in `public/_headers` already allows `static.cloudflareinsights.com`
  (script) and `cloudflareinsights.com` (beacon).
- **Preview URLs:** builds for non-production branches run `npx wrangler preview` (Worker
  Previews, in open beta), which needs the `previews` block in `wrangler.jsonc`; it is there and
  empty. Turn branch builds on or off under Worker → **Settings** → **Build** → **Branch
  control**.

## Fallback: keeping DNS at Porkbun

Worker custom domains need Cloudflare DNS. If DNS ever has to stay at Porkbun, use Porkbun URL
forwarding from `germle.com` and `www.germle.com` to the `workers.dev` address, which changes the
address bar and is a last resort; moving DNS to Cloudflare (steps 2–3) is the supported route.
