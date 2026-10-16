# Deploying glyphite.hornbaek.org

Set up the same way as horn-dev and hornbaek-site. The site is a Cloudflare Worker named `glyphite` with
static assets (`wrangler.jsonc`, `worker/`), serving what `npm run build` writes to `dist/` on the custom
domain **glyphite.hornbaek.org**.

- **Cloudflare Workers Builds deploys it.** Cloudflare pulls `main`, runs `npm run build:cloudflare` (the
  unit tests, then the build) and `npx wrangler deploy`. No deploy token lives in GitHub; the GitHub workflow
  only checks pull requests (the same build plus a smoke test of every game).
- **Only the landing page and the games are public.**
  1. A Cloudflare Access application asks for the login. It covers `glyphite.hornbaek.org/login` (section 5);
     before that change it covered the whole hostname, and everything still works that way, minus the landing page.
  2. The Worker checks the Access token itself on every request (`worker/auth.js`, the same check as
     hornbaek-site's admin): signature, this application's AUD tag, expiry, and optionally the email.
     `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are in `wrangler.jsonc` (neither is secret). While `ACCESS_AUD`
     is empty, the Worker answers **503 "not open yet"** to every private page.
  3. The Worker decides what anyone may see (`worker/index.js`, `isPublic`): `/` is the landing page
     (`portal/welcome/`) for visitors who are not signed in and the game list for those who are; `/welcome/…` (the
     landing page's files, the games' titles and thumbnails), `/games/showcase/` (the live demo on it) and the page of each
     game listed on the landing page (`/games/<id>/`, from `welcome/site.json`; `isPublicGame`) are public. Everything else,
     including a game's `game.json`, sources and reference art, the editor, the idea bank and the ART pages, needs the sign-in: a browser is sent to `/login?next=…`, files and the API get a 401.
     `tests/node/routes.test.mjs` pins this down. Making anything else public goes to the owner first.
  4. `workers_dev` and `preview_urls` are off; PR Previews get none of the Access vars, so they are closed too.

## One-time setup

### 1. The Access application

Zero Trust → **Access** → **Applications** → **Add an application** → **Self-hosted**:
- Application domain: `glyphite.hornbaek.org`.
- Policy: **Allow**, include **Emails** → your address (as for hornbaek.org/admin).
- Save, open it again, and copy the **Application Audience (AUD) Tag**.

Put the tag in `wrangler.jsonc` → `vars.ACCESS_AUD` and merge it (or tell a Claude session "the Glyphite AUD
is …"). The team domain is already there: `https://round-smoke-a734.cloudflareaccess.com`, the same team as
hornbaek-site.

### 2. Workers Builds

Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → `Hornbaek/Glyphite`:

| Setting | Value |
|---|---|
| Worker name | `glyphite` (must match `name` in `wrangler.jsonc`) |
| Production branch | `main` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npx wrangler deploy` (the default) |
| Root directory | `/` |
| Preview builds | on, if you want PR builds checked by Cloudflare too (the Previews stay closed; see below) |

The first build on `main` creates the Worker and attaches `glyphite.hornbaek.org` from the `routes` entry
(the zone is on the same account). Node comes from `.nvmrc` (22).

### 3. The D1 database (the idea bank)

`wrangler.jsonc` binds a D1 database called `glyphite` as `DB` (id in the file; it is not secret). It holds the idea
bank's stars, statuses, notes and [?] marks (`worker/ideas.js`, schema in `migrations/`). It already exists and has its table; to
recreate it elsewhere: create a database named `glyphite` (Workers & Pages → D1), put its id in `wrangler.jsonc`, and run
`npx wrangler d1 migrations apply glyphite --remote` (or paste `migrations/*.sql` into the dashboard's console). Without the
binding the idea bank page still loads but says it cannot save.

### 4. Optional: who may use it

Access already decides who can sign in. To narrow it further in the Worker, set `ALLOWED_EMAILS`
(comma-separated) under the Worker → **Settings** → **Variables and Secrets**; `keep_vars` keeps it across
deploys. Vars that are in `wrangler.jsonc` are overwritten by every deploy: change those in the file.

### 5. The public landing page: Access on /login only

Do this after the pull request that adds the landing page has deployed (until then the old Worker turns away everyone
without a token, and nobody could sign in). Zero Trust → **Access** → **Applications** → the Glyphite application →
**Configure**:
- **Application domain** (Public hostname): keep `glyphite.hornbaek.org`, and set the **path** to `login`. Keep the same
  application: its AUD tag stays the same, so nothing in `wrangler.jsonc` changes.
- **Settings → Cookie settings**: leave **Cookie Path Attribute** off, so the sign-in cookie is sent for the whole site
  (the Worker reads it on every page).
- Save. In a private window, `glyphite.hornbaek.org` now shows the landing page and its games' **PLAY** buttons work
  without a login; **LOG IN** asks for the login and comes
  back to the game list; a private address (e.g. `/edit/`) asks for the login and comes back to it. Signed in, `/` is
  the game list as before (the landing page stays at `/welcome/`, the **ABOUT** button on the game list).

To close it again, remove the path (the application covers the whole hostname again). With Access on `/login` only,
the Worker's token check is what guards the private pages, so keep `worker/auth.js`, `isPublic` and `isPublicGame` strict.

## Where things show up

| What | Where |
|---|---|
| Did this commit deploy? | GitHub: the "Workers Builds: glyphite" check on the commit. |
| Why did it fail? | Dashboard → Workers & Pages → `glyphite` → **Deployments** → **View build history** → the build log. |
| What is live? | The same **Deployments** tab: the active deployment and its commit. |

**A failed build changes nothing**: the site keeps serving the previous version.

| Symptom | Likely cause | What to do |
|---|---|---|
| The build fails in `npm test` or the build | The code; CI runs the same steps on the PR, so it should have been red there first. | Fix it in a PR. |
| It fails installing dependencies | `package-lock.json` disagrees with `package.json`. | `npm install`, commit the lockfile. |
| Name mismatch | The dashboard Worker isn't called `glyphite`. | Rename one to match; don't merge a PR Cloudflare offers that renames `wrangler.jsonc`. |
| The PR check fails at `npx wrangler preview` | The `previews` block is missing from `wrangler.jsonc`. | Restore `"previews": {}`. |
| The site says **503 … not open yet** | `ACCESS_AUD` is still empty in `wrangler.jsonc`. | Step 1. |
| **401 "not valid"** after signing in | The AUD tag or team domain doesn't match the Access application. | Copy the AUD again. |
| **403** after signing in | Your email isn't in `ALLOWED_EMAILS`. | Fix the variable in the dashboard. |
| **401 "the sign-in did not come through"** on `/login` | Access does not cover `/login` (section 5). | Set the application's path to `login`. |
| LOG IN goes round in a loop | **Cookie Path Attribute** is on, so the cookie is only sent for `/login`. | Turn it off (section 5). |
| `glyphite.hornbaek.org` doesn't answer | The custom domain didn't attach. | The Worker → **Settings** → **Domains & Routes**. |
| The idea bank says "could not be read" or "not saved" | The `DB` binding or the `idea_state` table is missing. | Section 3 above; the message names the cause. |

Roll back from **Deployments** (promote the previous one), then fix forward.

## Previews

Preview builds run `npx wrangler preview` and serve the branch on its own workers.dev URL. Previews get none
of the top-level vars, so this Worker answers every request there with 503: the build is checked and nothing
leaks. To open Previews to yourself, protect them with Access (the Worker → **Settings** → **Domains & Routes**
→ enable Cloudflare Access for Preview URLs) and give them that application's values in `wrangler.jsonc`:
`"previews": { "vars": { "ACCESS_TEAM_DOMAIN": "…", "ACCESS_AUD": "<the Preview Access app's AUD>" } }`.

## By hand

```sh
npx wrangler login
npm run deploy                         # builds, then wrangler deploy
```

## Local development

```sh
npm run serve                          # plain static server for dist/ on :8787, no login (quickest)
echo 'DEV_EMAIL=you@example.com' > .dev.vars && npm run dev   # the real Worker in wrangler dev
```
`DEV_EMAIL` skips the Access check only for requests to localhost (`npm run dev` passes
`--local-upstream localhost:8787`, because wrangler dev otherwise presents requests as the custom domain).
`.dev.vars` is git-ignored.
