---
name: LifeTracker
status: active
phase: building
last_review: 2026-07-29
---

# LifeTracker

Private local Next.js Google-Maps family-location app over the Home Assistant Life360 history DB — place naming, road-snapped routes, stale-fix prediction, and trip replay.

## Now
- Unblocked — .env.local now holds a working (unrestricted) Google Maps browser/server key pair + Map ID (inferred)
- `dev`/`build:op`/`start:op` scripts route through the shared 1Password SDK runner (`~/Code/.codehq/1password/oprun`) using the dev-workstation service account token, instead of the deprecated `op run` CLI path (2026-07-22) (inferred)

## Next
- Verify `npm run dev` still boots the map end-to-end under the new `oprun` SDK wrapper (needs `OP_SERVICE_ACCOUNT_TOKEN` file at `~/.config/op/dev-workstation.token`) (inferred)
- Restrict the Google Maps API keys (currently unrestricted quick-start keys) (inferred)
- Run `npm run sync` (HA mirror via `hass` ssh alias) to confirm fresh data alongside the live map (inferred)

## Roadmap
- Keep sync watcher (`scripts/sync.sh --watch`) running for fresh data
- Iterate on prediction/replay once live map is unblocked

## Done
- Switched `dev`/`build:op`/`start:op` from the `op run` CLI to the shared 1Password SDK runner (`oprun`) — avoids desktop-app authorize prompts (2026-07-22)
- Wired `dev`/`build`/`start` to run via 1Password `op run` (dev-workstation service account) instead of plain `.env.local` (2026-07-14)
- Initial app: live map, stay-point detection, venue naming, route snapping, prediction, trip replay (2026-06-13)
- Live data, full geofence editing, and Home Assistant add-on packaging (2026-06-13)
- HA add-on build fixed (pinned Debian base), bumped to 1.0.1 with fresh-code rebuilds (2026-06-14)
- One-command release flow: release skill + scripts/release.sh + auto-updated add-on CHANGELOG (2026-06-14)
