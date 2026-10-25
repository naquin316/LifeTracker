---
name: LifeTracker
status: active
phase: building
last_review: 2026-10-25
---

# LifeTracker

Private local Next.js Google-Maps family-location app over the Home Assistant Life360 history DB — place naming, road-snapped routes, stale-fix prediction, and trip replay.

## Now
- Live at lifetracker.handlane.dev on add-on **v1.0.4** (Release 1, HOME-28 to HOME-33,
  batch-tested 2026-10-24, plus the `?member=` link).
- 20 geofences on the add-on (checked 2026-10-24); none overlap.
- Geofences live in the add-on's `/data` on the HA box — the Mac's `data/places.json` is a
  separate copy that drifts. Pull it from `http://192.168.86.42:3939/api/geofences` before
  trusting or editing it locally.

## Next
- Merge `tb/cve-upgrades` (`next` 16.3.5 + CVE overrides) to main and release it as 1.0.4.
- Releasing: bump `lifetracker/config.yaml`, push main, then HA → Settings → Apps → store ⋮ →
  Check for updates (Auto update is on; it picks up the new version from there).
- Close HOME-28 to HOME-33 in Plane if any are still open (batch test passed).
- Restrict the Google Maps API keys (still the unrestricted quick-start pair)
- Verify `npm run dev` boots end-to-end under the `oprun` SDK wrapper (needs
  `~/.config/op/dev-workstation.token`)
- Consider a `places` sync command (Mac ↔ add-on) instead of hand-syncing via curl

## Roadmap
- Keep sync watcher (`scripts/sync.sh --watch`) running for fresh data
- Iterate on prediction/replay

## Done
- `?member=<name>` opens the live map on that person, matched case-insensitively and applied once on the first load (`LiveMap.tsx`). The Home Hub's People row links here. Released v1.0.4 and checked live after the Rebuild: the link zooms to the person with their card open (2026-10-25)
- Release 1 batch-tested and passed by Ryan (2026-10-24), live as add-on v1.0.3:
  - HOME-28: a geofence edit or delete with an empty, bad or out-of-range index is
    refused and no longer changes fence #0
  - HOME-29: a stay doesn't merge across a real errand, and its centre ignores the
    errand's fixes
  - HOME-30: the hour-of-day prediction treats 11 PM and midnight as neighbours
  - HOME-31: replay of a long drive keeps everything after fix #100
  - HOME-32: different drives between the same two places each get their own route
  - HOME-33: `/api/trip` refuses a backwards window and anything over 7 days
- Released add-on v1.0.3 with Release 1 (HOME-28 to HOME-33), checked live: `/api/trip` refuses a reversed or over-7-day window (2026-10-23)
- Release 1 fixes, all on main (2026-10-23):
  - HOME-28: geofence PUT/DELETE with an empty or bad index is 400, out of range is 404;
    neither touches fence #0 any more
  - HOME-29: stays don't merge across a real errand (a fix over 250 m away); the stay's
    centre uses only its clustered fixes
  - HOME-30: the hour-of-day prediction fallback wraps midnight, so 11 PM and
    midnight count as neighbours
  - HOME-31: replay snaps long drives in overlapping 100-point chunks and stitches them,
    so nothing after fix #100 is lost
  - HOME-32: the route cache keys on a hash of every sample, so different drives between
    the same two places no longer share one path
  - HOME-33: `/api/trip` returns 400 on a reversed window and caps the range at 7 days
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
