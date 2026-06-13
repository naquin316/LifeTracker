# LifeTracker (Home Assistant add-on)

Runs the LifeTracker family-location web app on your HA box. It reads the Life360
history DB from `/share` for trip replay and pulls **near-real-time** positions
from HA's live `device_tracker.life360_*` entities via the Supervisor API.

## Install

1. Settings → Add-ons → Add-on Store → ⋮ (top-right) → **Repositories** → add
   `https://github.com/naquin316/LifeTracker`.
2. Find **LifeTracker** in the store and click **Install** (first build takes a
   few minutes — it builds the app).
3. In the add-on **Configuration** tab, set:
   - `google_browser_key` — Maps JavaScript API key (HTTP-referrer restricted)
   - `google_server_key` — Geocoding/Places/Roads/Directions key
   - `google_map_id` — optional Map ID
4. **Start** the add-on. Open `http://<HA-IP>:3939`.

## Notes

- Geofences and the Google response cache persist in the add-on's `/data`.
- Live positions need no token here — the add-on uses the Supervisor API.
- To update the app: bump `version` in `config.yaml` upstream and **Rebuild**.
