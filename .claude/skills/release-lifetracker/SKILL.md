---
name: release-lifetracker
description: Use when the user wants to publish/release/deploy/ship LifeTracker changes live to lifetracker.handlane.dev. Triggers include "release LifeTracker", "deploy LifeTracker", "publish the app", "ship it", "push it live", "make it live". Runs the verify → version-bump → commit → push pipeline and guides the Home Assistant add-on update.
---

# Release LifeTracker

Publishes LifeTracker changes live to **https://lifetracker.handlane.dev**.

LifeTracker runs as a Home Assistant add-on that builds the app from GitHub
`main`. Publishing = push to `main` **and bump the add-on version** so HA
rebuilds with fresh code (the version bump busts the Docker layer cache via the
Dockerfile's `BUILD_VERSION` arg).

## Steps

1. **Check there's something to release** — `git status`. If the working tree is
   clean and `main` is already pushed, tell the user there's nothing to release.
2. **Run the release script** from the project root:
   ```bash
   scripts/release.sh "<concise commit message>"      # patch bump (default)
   scripts/release.sh "<message>" minor               # or minor / major
   ```
   It verifies (`tsc --noEmit`, `vitest run`, keyless `next build`), bumps the
   patch version in `lifetracker/config.yaml`, commits, and pushes to `main`.
   **If verification fails, STOP and fix it — do not release broken code.**
3. **Trigger the HA rebuild.** This can't be automated (the Supervisor isn't
   reachable over SSH — Protection Mode + read-only `/addons`), so tell the user:
   - If the add-on's **Auto update** is ON → HA rebuilds on its next check; force
     it now via **Add-ons → Store → ⋮ → Check for updates**.
   - Else → **Settings → Add-ons → Store → ⋮ → Check for updates → LifeTracker →
     Update** (rebuilds + restarts, ~2–4 min).
4. **Verify live** after they confirm the update finished: `lifetracker.handlane.dev`
   should `302` to `handlane.cloudflareaccess.com` (Access gate intact). From a
   sandbox that can't resolve it, query a public resolver first:
   `dig +short lifetracker.handlane.dev @1.1.1.1`, then
   `curl --resolve lifetracker.handlane.dev:443:<IP> -sS -o /dev/null -w '%{http_code}' -L https://lifetracker.handlane.dev/` (expect a 302 to cloudflareaccess before login).

## Notes

- **No rebuild needed** for: geofences (edited in-app, stored in `/data`), Google
  keys (add-on **Options → Restart**), or live positions (automatic).
- The repo is **public** — never commit secrets, home address/coords, or names.
- Recommend turning on the add-on's **Auto update** toggle so step 3 becomes
  hands-off after running the script.
