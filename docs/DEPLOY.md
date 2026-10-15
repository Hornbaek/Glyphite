# Deploying glyphite.hornbaek.org

The site is a Cloudflare Worker named `glyphite` with static assets (`wrangler.jsonc`, `worker/`). It serves
`dist/` (what `npm run build` writes) on the custom domain **glyphite.hornbaek.org**. Nothing is public:

1. **Cloudflare Access** (Zero Trust) sits in front of the hostname and asks for a login.
2. The Worker also verifies the Access token (`Cf-Access-Jwt-Assertion`) and the allowed email on every
   request (`worker/auth.js`). The variables are the same as the other hornbaek.org Workers use:
   `TEAM_DOMAIN`, `POLICY_AUD` and `ALLOWED_EMAIL`. Until all three are set, the Worker answers
   **503 "not open yet"** to everyone; it never falls back to serving the site openly.
3. `workers_dev` and `preview_urls` are off, so no `*.workers.dev` address serves the site.

## One-time setup

### 1. The Access application (do this first)

Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**:
- Application domain: `glyphite.hornbaek.org`.
- Policy: **Allow**, include **Emails** → your email address.
- Save. Open the application again and copy its **Application Audience (AUD) Tag**.
- Your team domain is in Zero Trust → **Settings** → **Custom Pages** (or the existing Workers' `TEAM_DOMAIN`):
  `https://<team>.cloudflareaccess.com`.

### 2. Deploy from GitHub (recommended)

The workflow `.github/workflows/ci.yml` checks every pull request (build, unit tests, smoke tests of every game
in both renderers) and, on every push to `main`, deploys with `wrangler deploy`. In the GitHub repository
(**Settings** → **Secrets and variables** → **Actions**) add:

| Kind | Name | Value |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | An API token from the **Edit Cloudflare Workers** template, scoped to your account and to the `hornbaek.org` zone (the custom domain needs *Zone → Workers Routes → Edit*; creating the Worker the first time needs account-level Workers access). |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Your account ID (dashboard → Workers & Pages, right-hand column). |
| Variable | `TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| Variable | `POLICY_AUD` | The AUD tag from step 1. |
| Variable | `ALLOWED_EMAIL` | Your email (comma-separate several people). |

Then merge to `main` (or re-run the workflow). The first deploy creates the Worker, the DNS record and the
certificate for `glyphite.hornbaek.org`; it can take a minute before the hostname answers. Without the token
secret, the deploy step only prints a warning, so CI stays green until you set it up.

### Alternative: Cloudflare Workers Builds

Dashboard → **Workers & Pages** → **Create** → **Import a repository** → `hornbaek/glyphite`, build command
`npm ci && npm run build`, deploy command `npx wrangler deploy`. Set `TEAM_DOMAIN`, `POLICY_AUD` and
`ALLOWED_EMAIL` under the Worker's **Settings** → **Variables and Secrets** (`keep_vars` keeps them across
deploys). Use one deploy path, not both: leave the GitHub `CLOUDFLARE_API_TOKEN` secret unset if Workers Builds deploys.

### Alternative: from a terminal

```sh
npx wrangler login
npm run deploy                         # builds, then wrangler deploy (the Access variables stay as set on the Worker)
```

## Checking it

- `https://glyphite.hornbaek.org/` → the Access login, then the game list.
- In a private window without logging in, you only ever see the Access login page.
- If you see **"GLYPHITE · 503 … not open yet"**: one of the three variables is missing on the Worker.
- If you see **401 / 403** from the Worker after logging in: the AUD tag or team domain doesn't match the Access
  application, or your email isn't in `ALLOWED_EMAIL`.

## Local development

```sh
npm run serve                          # plain static server for dist/ on :8787, no login (quickest)
echo 'DEV_USER=you@example.com' > .dev.vars && npm run dev   # the real Worker in wrangler dev
```
`DEV_USER` skips the Access check only when the request is for localhost; `.dev.vars` is git-ignored.
