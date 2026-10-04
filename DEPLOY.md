# Deploying Germle

Germle is a static site. Cloudflare Pages builds it from `main` on every push. Nothing in the
repo holds secrets, and the build needs no environment variables.

These steps need someone logged in to the Cloudflare and Porkbun accounts. Do them in order.

## Checklist

- [ ] 0. Make `main` the default branch on GitHub
- [ ] 1. Connect the repo to Cloudflare Pages
- [ ] 2. Move DNS for `germle.com` to Cloudflare
- [ ] 3. Point Porkbun's nameservers at Cloudflare
- [ ] 4. Attach `germle.com` and `www.germle.com` to Pages, and add the www → apex redirect rule
- [ ] 5. Verify
- [ ] 6. Optional: Web Analytics and preview deployments

## 0. Make `main` the default branch

The first branch pushed to the empty repo was the agent's working branch, so GitHub made it the
default. GitHub → `germle` → **Settings** → **General** → **Default branch** → switch to `main`.
Then delete `claude/ecstatic-volta-wr90cz` under **Branches** if you like. Cloudflare only cares
about the production branch you pick in step 1, so this is housekeeping, not a blocker.

## 1. Connect the repo

Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** →
**Connect to Git** → authorise GitHub (choose **Only select repositories** → `germle`) → select
`germle`. If the create screen opens on a Workers setup, switch to the **Pages** tab (or follow the
"Looking to deploy Pages?" link); a Worker is the wrong project type here.

| Setting                | Value                     |
| ---------------------- | ------------------------- |
| Production branch      | `main`                    |
| Framework preset       | Vite (or None)            |
| Build command          | `npm run build`           |
| Build output directory | `dist`                    |
| Environment variables  | none                      |
| Node version           | read from `.node-version` |

Save and deploy. Confirm `https://germle.pages.dev` serves the site. (If that name is taken,
Cloudflare appends a suffix such as `germle-abc.pages.dev`; use whatever it shows below.)

## 2. Move DNS to Cloudflare

This is the simplest route, and it is required for the apex domain to work with Pages without
`ALIAS` records.

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

## 4. Attach the domain to Pages

Wait until the zone shows **Active** (step 3). Then Pages project → **Custom domains** →
**Set up a custom domain** → `germle.com`. Repeat for `www.germle.com`. Cloudflare creates the
DNS records and certificates itself; each domain shows **Active** after a few minutes.

**www → apex redirect.** The brief planned this as a line in `public/_redirects`, but Cloudflare
Pages `_redirects` only matches paths and does not support domain-level redirects, so it has to be
a zone rule (one-time, no code):

Cloudflare → `germle.com` zone → **Rules** → **Overview** → **Templates** → **Redirect from WWW
to Root** → **Create rule**. The template fills in:

| Field                      | Value                                         |
| -------------------------- | --------------------------------------------- |
| If incoming requests match | Wildcard pattern, request URL `https://www.*` |
| Then: target URL           | `https://${1}`                                |
| Status code                | `301`                                         |
| Preserve query string      | on                                            |

Deploy the rule. It only fires if the `www` DNS record is proxied (orange cloud), which it is when
Pages created it in the step above.

## 5. Verify

- `https://germle.com` loads with a valid certificate.
- `https://www.germle.com/anything` redirects (301) to `https://germle.com/anything`.
  From a terminal: `curl -sI https://www.germle.com/anything | grep -i -E '^(HTTP|location)'`
- `https://germle.pages.dev` still works.
- Response headers include the security headers from `public/_headers`:
  `curl -sI https://germle.com | grep -i content-security-policy`

## 6. Optional

- **Web Analytics:** Cloudflare → **Analytics & Logs** → **Web Analytics** → add `germle.com`
  with **automatic setup**. No code change is needed: Cloudflare injects its beacon script, and
  the Content-Security-Policy in `public/_headers` already allows `static.cloudflareinsights.com`
  (script) and `cloudflareinsights.com` (beacon).
- **Preview deployments:** Pages project → **Settings** → **Builds & deployments** → enable
  preview deployments for branches if you want a preview URL on each PR.

## Fallback: keeping DNS at Porkbun

If DNS ever stays at Porkbun instead of Cloudflare: add an `ALIAS` record at the apex pointing to
`germle.pages.dev`, a `CNAME` for `www` pointing to `germle.pages.dev`, and delete Porkbun's URL
forwarding and parking records. A plain `CNAME` at the apex will not work.

Without Cloudflare DNS there is no zone Redirect Rule, so `www` would serve the site directly
instead of redirecting. If you want the redirect in that setup, replace the `www` CNAME with a
Porkbun URL forward from `www.germle.com` to `https://germle.com` (permanent, include path).
