# Changelog

## 1.0.1
- Reliable rebuilds: the add-on Dockerfile now busts Docker's build cache on
  each version bump, so updates always fetch the latest code from `main`.

## 1.0.0
- Initial release.
- Live family map over Home Assistant Life360 data — near-real-time positions
  (~5s) via the Supervisor API, with a DB fallback.
- Best-guess place names via Google (Geocoding / Places); every location tagged
  **real** vs **guessed**.
- Trip replay with road-snapped routes, animated playback, and named stops.
- User-defined geofences (add / edit / move / resize / delete) that override
  Google's guess; click a place to zoom to it.
- Responsive dark UI. Reads the Life360 history DB from `/share`; geofences and
  the Google response cache persist in `/data`. Google keys set via add-on
  options (delivered at runtime).
