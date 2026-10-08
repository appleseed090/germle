# Deploying Germle

Germle is a static site served by Cloudflare as Workers static assets, plus a small Worker script
that answers `/api/*` for the community score comparison and keeps its data in a Cloudflare D1
database. Both are configured in `wrangler.jsonc`. Workers Builds builds it from `main` on every
push. Nothing in the repo holds secrets, and the build needs no environment variables.

These steps need someone logged in to the Cloudflare and Porkbun accounts. Do them in order.

## Checklist

- [x] 0. Make `main` the default branch on GitHub
- [x] 1. Connect the repo to Cloudflare Workers
- [x] 2. Move DNS for `germle.com` to Cloudflare
- [x] 3. Point Porkbun's nameservers at Cloudflare
- [x] 3a. Clear Porkbun's own parking: URL forward deleted and Porkbun's records pointed at
      Cloudflare (2026-10-06, after iMessage previews showed Porkbun's page)
- [x] 4. Attach `germle.com` and `www.germle.com` to the Worker, and add the www → apex redirect rule
- [x] 5. Verify (2026-10-05; the `workers.dev` address was not checked)
- [ ] 6. Optional: Web Analytics and preview deployments. Previews work (2026-10-05); Web
      Analytics is not on: the live page has no Cloudflare beacon script.
- [ ] 7. Create the D1 database and put its ID into `wrangler.jsonc` (blocks merging)
- [ ] 8. Apply the migrations to the production database (blocks the API working)
- [ ] 9. Add the migrations to the Workers Builds deploy command (blocks future schema changes)
- [ ] 10. Merge, then check the API on `germle.com`
- [ ] 11. Optional, only if abuse appears: a rate-limiting rule for `/api/*`

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
| Deploy command        | see step 9                                       |
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

### 3a. Clear Porkbun's own parking

A new Porkbun domain comes with a URL forward (`germle.com` → `http://germle-com.l.ink`, a 302
with wildcard and path) and parking records. Changing the nameservers does not remove them, and
Porkbun's nameservers keep answering for the domain. Any network that still asks Porkbun, because
it cached Porkbun as the domain's nameserver before the switch (the `.com` registry lets that
last up to 48 hours, and some routers hold on longer), is sent to Porkbun's "A Brand New Domain!"
pig page. iMessage builds link previews on the sender's phone, so those cards show the pig
too. That happened here on 2026-10-06 on the owner's home Wi-Fi.

So, right after step 3, in Porkbun → `germle.com`:

1. **URL Forwarding** (pencil icon) → delete the forward under **Current Forwards**. Add nothing.
2. **DNS Records** → delete any parking records (pointing at `pixie`, `uixie` or
   `lixie.porkbun.com`, including `*`). Leave the MX, SPF and `_acme-challenge` records. Then add
   Cloudflare's addresses for `germle.com` and for `www`: two A and two AAAA records each, with a
   TTL of 600 seconds. Read the current addresses from a public resolver, for example
   `dig +short germle.com A @1.1.1.1` and `dig +short germle.com AAAA @1.1.1.1` (on 2026-10-06:
   `104.21.9.13`, `172.67.188.223`, `2606:4700:3035::6815:90d`, `2606:4700:3036::ac43:bcdf`).
   A lookup that still reaches Porkbun then lands on the real site, because Cloudflare serves
   `germle.com` on those addresses whichever DNS server gave them out.
3. Whenever Porkbun shows the red **"Oh no!"** box offering to switch to its nameservers, choose
   **No, thank you.** "Yes" moves the nameservers back to Porkbun and takes the site offline.

The records in point 2 are only for the changeover; delete them a couple of weeks later (see
`TODO.md`).

**Spotting it:** links open fine, but on one network `curl -sI https://germle.com` answers
`302` with `server: openresty` and a `location` on `l.ink`, while `nslookup germle.com` already
shows Cloudflare's addresses. A link sent from the same phone over cellular gets the right card.

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
  control**. Previews do not inherit bindings, so they have no database: their `/api/*` answers
  503 and the game shows no comparison. Leave it that way, and do not add the `DB` binding to the
  Worker's preview settings in the dashboard: previews would then write to the production
  database. `npx wrangler preview` prints a warning that `DB` is "configured for your production
  Worker but not for Previews"; that is expected.

## 7. Create the D1 database

From a checkout of the branch, logged in to Cloudflare (`npx wrangler login` once):

```sh
npx wrangler d1 create germle
```

It prints a config snippet with a `"database_id"` (a UUID) and asks **"Would you like Wrangler to
add it on your behalf?"**: answer **No**, since `wrangler.jsonc` already has the `DB` binding.
Paste the ID over `REPLACE-WITH-THE-ID-FROM-wrangler-d1-create` in `wrangler.jsonc` and commit.

This blocks merging: with the placeholder, `wrangler deploy` fails and Workers Builds publishes
nothing (the live site keeps its last good version). Wrangler would otherwise create a database
of its own on deploy, so the placeholder is there on purpose.

## 8. Apply the migrations

```sh
npx wrangler d1 migrations apply germle --remote
```

Expected: a table listing `0001_create_results.sql` with ✅. Running it again prints
"✅ No migrations to apply!". Check the table:

```sh
npx wrangler d1 execute germle --remote --command "SELECT COUNT(*) AS games FROM results"
```

Expected: one row, `games` 0 (before anyone plays). Until this step is done, every submission
answers 500 and the game simply shows no comparison; nothing else breaks.

## 9. Run migrations on deploy

Worker → **Settings** → **Build** → **Deploy command**:

```sh
npx wrangler d1 migrations apply germle --remote && npx wrangler deploy
```

Leave the non-production deploy command as `npx wrangler preview`: previews have no database.
Migrations run before the new code, and a deploy with nothing new to apply only prints "No
migrations to apply". If the build fails at the migration step with an authentication or
permission error, the build's API token cannot edit D1: give it **D1 Edit** under the Worker's
build settings (API token), or go back to `npx wrangler deploy` and run step 8 by hand before
merging any change that adds a file to `migrations/`. Not verified from here: whether the
default Workers Builds token already has D1 access.

Step 8 by hand is enough for the first release, so this step only blocks later schema changes.

## 10. Check the API

After merging and once the build is green:

```sh
# The site itself is unchanged: expect 200, then a CSP header.
curl -s -o /dev/null -w '%{http_code}\n' https://germle.com/about
curl -sI https://germle.com/about | grep -i '^content-security-policy'

# The database answers: expect 404 (no score for this made-up player).
# 503 means the DB binding is missing; 500 means step 8 was skipped.
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://germle.com/api/standing?puzzle=1&player=00000000-0000-4000-8000-000000000000'

# Validation: expect 400 (an unfinished game; nothing is stored) and 405 (wrong method).
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  --data '{"puzzleNumber":1,"playerId":"00000000-0000-4000-8000-000000000000","moves":[]}' \
  https://germle.com/api/results
curl -s -o /dev/null -w '%{http_code}\n' https://germle.com/api/results
```

Then finish a daily puzzle in a browser and run the count from step 8 again: `games` should be

1. The comparison itself stays hidden until 10 people have played a puzzle.

## 11. Rate limiting, if needed

The API has no captcha and no rate limiting in code. If abuse shows up (a flood of rows in
`results`), add a rate-limiting rule in the `germle.com` zone: **Security** → **WAF** → **Rate
limiting rules**, matching URI path starts with `/api/`.

## Fallback: keeping DNS at Porkbun

Worker custom domains need Cloudflare DNS. If DNS ever has to stay at Porkbun, use Porkbun URL
forwarding from `germle.com` and `www.germle.com` to the `workers.dev` address, which changes the
address bar and is a last resort; moving DNS to Cloudflare (steps 2–3) is the supported route.
