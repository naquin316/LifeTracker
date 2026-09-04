---
name: LifeTracker
status: active
phase: building
last_review: 2026-09-04
---

# LifeTracker

Private local Next.js Google-Maps family-location app over the Home Assistant Life360 history DB — place naming, road-snapped routes, stale-fix prediction, and trip replay.

## Now
- Live at lifetracker.handlane.dev on add-on **v1.0.2**; 20 curated geofences in place
- Geofences live in the add-on's `/data` on the HA box — the Mac's `data/places.json` is a
  separate copy that drifts. Pull it from `http://192.168.86.42:3939/api/geofences` before
  trusting or editing it locally.

## Next
- Turn on the add-on's **Auto update** — a release currently needs a manual HA Rebuild
- Restrict the Google Maps API keys (still the unrestricted quick-start pair)
- Verify `npm run dev` boots end-to-end under the `oprun` SDK wrapper (needs
  `~/.config/op/dev-workstation.token`)
- Consider a `places` sync command (Mac ↔ add-on) instead of hand-syncing via curl
- Two Lone Oak St geofences overlap (175m apart, r=130 and r=60) — first match wins, so the
  second never fires. Merge or shrink one.

## Roadmap
- Keep sync watcher (`scripts/sync.sh --watch`) running for fresh data
- Iterate on prediction/replay

## Done
- Collapsible Places panel shipped as add-on v1.0.2 — native `<details>` + scroll-capped
  list, so a 20-item list no longer pushes People off screen (2026-09-04)
- **Deploy gotcha:** HA "Check for updates"/"Update" did NOT pick up v1.0.2; add-on →
  ⋮ → **Rebuild** did, and served the new bundle in 40s. Supervisor is unreachable from
  the Mac for automation — `ha` CLI over ssh is `unauthorized`, the docker socket is
  permission-denied under protection mode, and a long-lived HA token gets 401 on
  `/api/hassio/*` (only `hassio.addon_start/restart/stop` services exist, no rebuild).
  The Rebuild click is human-only. (2026-09-04)
- Built 20 named geofences from 60 days of history: Gracie's new Austin apartment
  (identified from 16/21 overnight clusters after her UT move), Forest's apartment,
  H-E-B 404 Warehouse, plus candidate places for Meredith/Ryan/Emma and the Carters,
  each verified by replaying a real stay and confirming `source: geofence` (2026-09-04)
- `.claude/settings.local.json`: allow rules for the direct-to-main push
  (`BRAYNEE_ALLOW_MAIN_PUSH=1 git push origin main`) and `scripts/release.sh` (2026-09-04)
- Switched `dev`/`build:op`/`start:op` from the `op run` CLI to the shared 1Password SDK runner (`oprun`) — avoids desktop-app authorize prompts (2026-07-22)
- Wired `dev`/`build`/`start` to run via 1Password `op run` (dev-workstation service account) instead of plain `.env.local` (2026-07-14)
- Initial app: live map, stay-point detection, venue naming, route snapping, prediction, trip replay (2026-06-13)
- Live data, full geofence editing, and Home Assistant add-on packaging (2026-06-13)
- HA add-on build fixed (pinned Debian base), bumped to 1.0.1 with fresh-code rebuilds (2026-06-14)
- One-command release flow: release skill + scripts/release.sh + auto-updated add-on CHANGELOG (2026-06-14)
