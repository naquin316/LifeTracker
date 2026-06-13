# LifeTracker

A private, local family-location web app on Google Maps. It reads the GPS
history collected by the Home Assistant Life360 logger but does **not** just
plot the raw saved dots — it:

- **Names dwell places** via Google: when someone sits somewhere that isn't a
  saved Life360 place, it looks up the best-guess venue/address from the GPS.
- **Reconstructs real routes** by snapping the sparse 15-min samples to roads.
- **Predicts when stale**: if the latest fix is old, it estimates where the
  person probably is now from their historical time-of-day patterns.
- **Replays trips**: pick a person + time range and animate the journey,
  pausing at named stops.

Every shown location is tagged **real** (green) vs **guessed** (amber).

## Architecture

```
HA box (ssh hass)  --scripts/sync.sh-->  data/locations.db (read-only mirror)
                                              |
                                       Next.js app
                                       - API routes: analysis + Google calls (key server-side) + cache.db
                                       - browser: Google Maps, markers, replay
```

- `lib/db.ts` — reads the local SQLite mirror.
- `lib/stays.ts` — stay-point detection + jitter merge (dwell finder).
- `lib/places.ts` + `lib/google.ts` — best-guess venue naming (cached).
- `lib/routes.ts` — road-snapped route reconstruction (cached).
- `lib/predict.ts` — stale-fix prediction from history.
- `lib/timeline.ts` — flattens a trip into an animatable track.
- `app/api/{members,current,trip}` — JSON endpoints.
- `app/components/*` — live map, sidebar, replay UI.

## Setup

### 1. Google Maps Platform key

Create a project at <https://console.cloud.google.com> with billing enabled and
enable: **Maps JavaScript API**, **Geocoding API**, **Places API**,
**Roads API**, **Directions API**.

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...   # browser key, restricted to Maps JS API + referrer http://localhost:3939/*
GOOGLE_MAPS_SERVER_KEY=...                # server key for geocoding/places/roads/directions
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=...        # optional; enables Advanced Markers / cloud styling
```

Keys must live in a GCP project that has **billing enabled**. (For a quick start
you can use one unrestricted key for both vars, but restrict it afterward.)

Google calls are cached in `data/cache.db`, so repeat views and replays don't
re-bill.

### 2. Sync the location data

Mirrors the HA DB to `data/locations.db` (requires the `hass` ssh alias):

```bash
npm run sync            # one-shot
bash scripts/sync.sh --watch   # re-sync every 10 min
```

### 3. Run

```bash
npm run dev    # http://localhost:3939
```

(Port 3939 is pinned because 3000 = Grafana and 3001 = CloudCLI on this machine.)

Without a browser key the app shows a setup notice instead of the map; the data
APIs still work.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit tests (stay detection, timeline) |
| `npm run sync` | Pull the latest location data from the HA box |

## Named places (geofences)

User-defined geofences override Google's guess — useful when Google mislabels a
spot (e.g. a home-based business registered at your address) or to show friendly
names like "Home" / "Work". A fix inside a geofence is named by it with no
Google call.

**In the app:** on the Live map, open the **Places** panel (bottom of the
sidebar) → **+ Add** → tap the map where you want it → name it and set a radius
→ **Save place**. Delete from the same list. Saved geofences show as blue
circles on the map.

**Or edit the file directly** — `data/places.json` (gitignored, private):

```json
[
  { "name": "Home", "lat": 30.2672, "lon": -97.7431, "radiusM": 130, "address": "123 Main St" },
  { "name": "Work", "lat": 30.30,   "lon": -97.70,   "radiusM": 150 }
]
```

The file is re-read when it changes — **no rebuild/restart needed** to add or
edit a fence. To find a coordinate: open the spot in Google Maps and right-click
→ the lat/lon is at the top of the menu. `radiusM` is the geofence radius in
meters (~100–150 covers a house + GPS drift).

## Tuning

Heuristics live in `lib/config.ts`:

- `STALE_SECONDS` — when a fix counts as stale → prediction kicks in.
- `STAY_RADIUS_M` / `STAY_MIN_SECONDS` — dwell sensitivity. Raise the radius if
  stops at a large campus get split.
- `GOOD_ACCURACY_M` — accuracy threshold for a fix to be "real".

## Privacy

Everything runs locally on your machine and stays on your LAN. Only GPS
coordinates are sent to Google (for geocoding/places/routing) — the same data
any Google Maps lookup uses. No data is published or stored externally.
