# LifeTracker: codebase research (Factory 1 preflight, 2026-10-16)

What the code does **today**, checked against the code and real runs, not the
README or STATUS.md. Branch `agent/PREFLIGHT`, cut from `main` @ `507f1f1`.

## How it builds and runs

**Stack.** Next.js 16.2.9 (Turbopack, App Router), React 19.2, TypeScript 5
strict, `better-sqlite3` (native), Tailwind 4, Vitest 4. No vitest config file:
Vitest runs on defaults, so any `**/*.test.ts` is collected and there is **no
`@/` path alias in tests** (the app code uses `@/` everywhere in `app/`).
Checked on the Mac with Node 22.23.3 / npm 10.9.9; the add-on image is
`node:22-bookworm-slim`, so the Node major matches.

| Step | Command | Result today |
|---|---|---|
| Install | `npm ci` | `node_modules` was already present in the worktree; not re-run |
| Typecheck | `npx tsc --noEmit` | **green** (also covers `tests/`) |
| Tests | `npm test` (= `vitest run`) | **green**: 3 original files / 11 tests, now 9 files / 80 tests |
| Build | `npm run build` (= `next build`) | **green** in ~6 s with no env at all. One Turbopack warning: "whole project was traced unintentionally" via `next.config.ts → lib/db.ts` (`path.join(process.cwd(), …)` in `lib/db.ts:8`, `lib/cache.ts:8`, `lib/geofences.ts:21`) |
| Lint | `npm run lint` (= `eslint`) | **RED: 3 errors, 1 warning**, all React-Compiler rules in UI code (see Bugs) |
| Dev | `npm run dev` | Not run. Needs `$HOME/Code/.codehq/1password/oprun` **and** `.env.local`; plain `next dev` is not exposed as a script |
| Serve | `npm start` | `next start -p 3939`; not run |

**Runtime data flow.**

- **Mac/dev:** `scripts/sync.sh` copies the HA logger DB
  (`hass:/share/life360/life360_history.db`) to `data/locations.db` (scp, or an
  ssh `.dump` fallback). The app opens it read-only (`lib/db.ts`). Google answers
  are cached in `data/cache.db` (`lib/cache.ts`); geofences live in
  `data/places.json` (`lib/geofences.ts`). Paths can be overridden with
  `LOCATIONS_DB`, `CACHE_DB` and `PLACES_FILE`.
- **Production (HA add-on, `lifetracker/`):** the Dockerfile **clones public
  GitHub `main`** and runs `npm ci && npm run build`; `run.sh` points
  `LOCATIONS_DB` at `/share/life360/life360_history.db` (the live file, no
  sync) and keeps `places.json`/`cache.db` in `/data`. Google keys come from the
  add-on options. `SUPERVISOR_TOKEN` switches `/api/current` to live HA states.
- **Release:** `scripts/release.sh` = `tsc` + `vitest` + keyless `build`, a
  version bump in `lifetracker/config.yaml`, a CHANGELOG entry, then
  `git add -A && git commit && git push origin main`. HA then has to be
  told to **Rebuild** by hand (STATUS.md, 2026-09-04).

**Endpoints** (all `force-dynamic`): `GET /api/members`, `GET /api/current`
(HA live → else DB latest fix; stale → habit prediction; then geofence/Google
naming), `GET /api/trip?member&from&to` (stays + moves, named and road-snapped),
`GET|POST|PUT|DELETE /api/geofences` (by array index).

**Characterization tests added** (`tests/characterization/`, fixtures only:
temp SQLite files, temp `places.json`, `fetch` faked with canned Google/HA JSON):

- `stays-timeline.test.ts`: dwell/move splitting on 15-min sampling, anchor
  drift, the merge that erases round trips, replay-track seams.
- `db-current-predict.test.ts`: the mirror queries, real/guessed rules, the
  "run sync.sh" error, the stale DB handle, habit prediction.
- `geofences-api.test.ts`: file loading/validation, the mtime cache, the full
  CRUD route including the index bugs.
- `google-places-routes.test.ts`: venue choice (junk/distance/confidence),
  address fallback, cache, no-key path, polyline decode, snap truncation, route
  cache collisions.
- `live-and-routes.test.ts`: HA live mapping, Supervisor precedence,
  `/api/current` fallback and prediction, `/api/trip` end to end.
- `format.test.ts`: label boundaries.

Route handlers import `@/lib/*`, which Vitest can't resolve without a config
change. The tests forward each alias to the real module with
`vi.mock`/`vi.doMock(..., () => import("../../lib/x"))`. Nothing under test is
mocked; only the import path is. Because `vi.resetModules()` keeps mocked
modules, `live-and-routes.test.ts` re-registers the forwards after each reset.
Passes 3× in a row and under `TZ=UTC` and `TZ=Asia/Kolkata`.

## What's fragile

- **Module-load env capture.** `GOOGLE_SERVER_KEY` (`lib/config.ts:17`), HA URL/token
  (`lib/config.ts:21-22`), `DB_PATH` (`lib/db.ts:7`) and `CACHE_PATH`
  (`lib/cache.ts:7`) are read once, at import. Changing env needs a restart, and
  tests have to `vi.resetModules()`. `PLACES_FILE` is the exception (read per call).
- **Forever-cached singletons.** The DB handle (`lib/db.ts:10`) and cache handle
  (`lib/cache.ts:10`) are never reopened (see Bugs: a re-synced mirror is invisible).
- **Geofences are addressed by array index** (PUT/DELETE `?index=n`). Two open
  tabs, or the Mac copy vs the add-on copy (STATUS.md says they drift), can
  edit or delete the wrong fence. `loadGeofences` also hands out its cached
  array, and the POST/PUT handlers mutate it in place before saving
  (`app/api/geofences/route.ts:24,53`). If the write throws, the in-memory list
  is left with a phantom entry.
- **No auth on any endpoint.** Live family positions (`/api/current`), history
  (`/api/trip`) and geofence writes (home addresses) rely entirely on Cloudflare
  Access in front of `lifetracker.handlane.dev`. The add-on also publishes
  port 3939 on the LAN (`lifetracker/config.yaml:10-11`; STATUS.md curls
  `http://192.168.86.42:3939/api/geofences`), so anyone on the Wi-Fi can read and
  edit them without going through Access.
- **Prediction uses the server's local timezone** (`lib/predict.ts:6-9`). Inside
  the add-on container this depends on the TZ the Supervisor injects (not
  verified). With UTC, "same hour-of-week" would be 5–6 h off for Texas.
- **Prod builds from public GitHub `main`, not from this checkout.** Docker
  caching is only busted by bumping `version` in `config.yaml`. A green local
  build doesn't prove the add-on build (Linux, `npm ci` plus a native
  `better-sqlite3` compile) works.
- **`release.sh`** runs `git add -A` (commits anything lying around), uses
  BSD-only `sed -i ''`, and pushes straight to `main`. Its closing instructions
  ("Check for updates → Update") are the path STATUS.md says **did not work**;
  only Rebuild did. The release skill (`.claude/skills/release-lifetracker/SKILL.md`
  step 3) repeats the same stale advice.
- **`scripts/sync.sh --watch`:** `sync_once || echo …` (`scripts/sync.sh:57`)
  turns off `set -e` inside the function. On the dump fallback, a failed or
  truncated `ssh … .dump` keeps going: whatever `sqlite3` builds from a partial
  dump is `mv`'d over the good mirror, and the log still says "dump rebuild ok".
  One-shot mode is safe (errexit applies).
- **The schema is assumed, not checked.** `lib/db.ts` hard-codes the Life360
  logger's `location` columns (plus `entity_id`). A logger schema change fails
  at query time as a 500.
- **The Google client concurrency gate** (`lib/google.ts:13-30`) is
  module-global. Fine for one process; no timeout on `fetch`, so a hung Google
  call holds one of 6 slots indefinitely.
- **Docs drift:** README says to copy `.env.example`, which **doesn't exist**.
  README says `npm run dev` just works, but it needs `oprun` plus `.env.local`.
  README says tests cover "stay detection, timeline" (geofences too). STATUS.md
  "Live on v1.0.2" can't be verified from here.

## Bugs seen

Not fixed, as instructed. Tests marked **(pinned)** assert today's behaviour
and are named `pins current behaviour`. They will fail on purpose when someone
fixes the bug.

1. **Re-synced mirror is never seen by a running server.** (pinned)
   `lib/db.ts:13-21`: the handle is opened once and cached. `scripts/sync.sh:31,42`
   replaces the file with `mv` (new inode). *Happens:* `npm run dev` +
   `sync.sh --watch` serves the first snapshot forever. *Should:* reopen when the
   file's inode/mtime changes (prod is unaffected: it reads the live file in place).
2. **`DELETE /api/geofences?index=` (empty) deletes fence #0.** (pinned)
   `app/api/geofences/route.ts:62-66`: `Number("") === 0` passes the
   `isNaN` check. Same hole in PUT (`route.ts:34-35,48`): `?index=` edits fence #0.
   *Should:* 400 on a non-integer/empty index.
3. **`DELETE` with an out-of-range index reports `ok: true`** and rewrites the
   file unchanged (`route.ts:66-68`), while PUT returns 404 (`route.ts:49-51`).
   Fractional/negative indexes behave the same way. (pinned) *Should:* 404 like PUT.
4. **Merge erases real round trips.** (pinned) `lib/stays.ts:63-82`: consecutive
   clusters merge if their *centroids* are within 80 m, regardless of what
   happened between them. Home → a 5 km errand shorter than 10 min of fixes →
   home becomes one stay with no moves. *Should:* only merge when the gap's fixes
   also stay near (or the gap is short).
5. **Merged stays include the excursion fixes in their centroid and pointCount.**
   (pinned) `lib/stays.ts:84-95` slices `startIdx..endIdx` across the absorbed
   gap. In the test, one fix 5 km away drags "home" ~333 m off the house. That
   can push it outside its geofence and change the Google name. *Should:* take
   the centroid of the clustered fixes only.
6. **Hour-of-day fallback doesn't wrap midnight.** (pinned) `lib/predict.ts:35-38`
   uses `Math.abs(h - target) <= 1`, so 23:xx history is ignored for a 00:xx
   prediction (and vice versa). The weekly slice (`howDistance`) does wrap.
   *Should:* circular distance on 24 h.
7. **Roads snapping silently drops everything after fix #100.** (pinned)
   `lib/google.ts:123` slices to 100 points; `lib/routes.ts:55` then spreads the
   whole move's time over the truncated path. *Happens:* replay of a long drive
   ends at fix #100 and "arrives" at the move's end time; the rest of the route
   is gone. *Should:* chunk requests (Roads API allows 100 per call) and stitch.
8. **Route cache key collides for different routes.** (pinned) `lib/routes.ts:34-38`
   keys on start cell + end cell + fix count. Two different drives between the
   same two places with the same number of fixes share one cached path for 90
   days. *Should:* key on the full path (hash).
9. **`listMembers().count` is inflated by circles.** (pinned) `lib/db.ts:70-101`
   sums per-circle row counts, but each fix is logged once per circle, so a
   member in 2 circles shows ~2× fixes. *Should:* `count(DISTINCT ts)` per member.
10. **Live positions still need the local mirror.** (pinned) `lib/halive.ts:59`
    calls `getEntityMemberMap()`, which throws if the DB is missing (it does not
    return null), so `/api/current` returns 500 even when HA is reachable.
    *Should:* fall back to entity attributes or degrade.
11. **Empty Google answers are never cached.** `lib/cache.ts:70` skips null, and
    `lib/places.ts:153` returns null for "nothing here". Every view of such a
    spot re-bills Nearby + Geocode (tested: 4 calls for 2 lookups). Intentional
    for transient errors, but it can't tell "error" from "empty".
12. **Geofence cache is keyed on mtime alone.** (pinned) `lib/geofences.ts:29`: an
    edit within the filesystem's mtime granularity, or one that restores the
    mtime, is ignored until the next change. Low impact.
13. **Lint is red.** `npm run lint` → 3 errors:
    `app/components/Replay.tsx:53` and `:81` (`Date.now()` during render,
    `react-hooks/purity`), `app/components/LiveMap.tsx:120`
    (setState synchronously in an effect). Plus a warning at `LiveMap.tsx:129`.
    The app builds and runs; these are React-Compiler correctness rules, not
    crashes.
14. **Turbopack traces the whole project** (build warning) because of
    `path.join(process.cwd(), …)` in `lib/db.ts:8`, `lib/cache.ts:8`,
    `lib/geofences.ts:21`. It bloats the server trace; harmless today.
15. **`/api/trip` takes any window.** It doesn't check `from < to` (a reversed
    window returns an empty trip, tested) and has no cap on the range, so
    3 days to months pulls every fix plus a Google call per stay and move.

## Tests that need live credentials (not written)

- **Real Google Maps Platform calls** (Geocoding, Places Nearby, Roads, Directions):
  response shapes, billing behaviour, key restrictions. Needs `GOOGLE_MAPS_SERVER_KEY`.
  Covered here with canned JSON only.
- **Browser map rendering** (`app/components/*`, `@vis.gl/react-google-maps`):
  needs `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` and a browser. No UI tests exist.
- **HA live states** against the real Supervisor (`SUPERVISOR_TOKEN`) or a
  long-lived `HA_TOKEN`: real `device_tracker.life360_*` attributes and
  timestamps. Covered with a fixture states array only.
- **`scripts/sync.sh`** against `ssh hass`: scp vs the `.dump` fallback, and
  the real logger schema. Needs the `hass` ssh alias.
- **`npm run dev` / `build:op` / `start:op`** under `oprun` with the 1Password
  dev-workstation token.
- **Add-on Docker build** (`lifetracker/Dockerfile`), which clones public GitHub
  `main`: needs Docker and the network, and isn't a unit test.
- **`scripts/release.sh`**: it commits and pushes to `main`, so it must never
  run in a test.

## Recommended check

`npx tsc --noEmit && npm test && npm run build`. That is the typecheck, all 80
tests (including the characterization pins), and the keyless production build
the add-on runs. It takes about 10 s and needs no env or network. It matches
`release.sh`'s own verification. `npm run lint` is left out until the 3
React-Compiler errors are fixed; add it to the gate then.

CHECK: npx tsc --noEmit && npm test && npm run build
