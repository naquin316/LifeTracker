#!/usr/bin/env bash
set -e

OPTS=/data/options.json

# Google keys come from the add-on options (entered in the HA UI), delivered to
# the app at runtime — nothing secret is baked into the public image.
export GOOGLE_MAPS_BROWSER_KEY="$(jq -r '.google_browser_key // ""' "$OPTS" 2>/dev/null)"
export GOOGLE_MAPS_SERVER_KEY="$(jq -r '.google_server_key // ""' "$OPTS" 2>/dev/null)"
export GOOGLE_MAPS_MAP_ID="$(jq -r '.google_map_id // ""' "$OPTS" 2>/dev/null)"

# Read the Life360 history DB directly from /share (no scp), persist geofences
# and the Google response cache in the add-on's /data volume.
export LOCATIONS_DB=/share/life360/life360_history.db
export PLACES_FILE=/data/places.json
export CACHE_DB=/data/cache.db
export NODE_ENV=production
# SUPERVISOR_TOKEN is injected by Supervisor (homeassistant_api: true) → live data.

# Start with no places; add them in-app (Live map → Places → + Add).
[ -f "$PLACES_FILE" ] || echo '[]' > "$PLACES_FILE"

exec npm run start
