// Client-safe map constants. The Google API key + Map ID are NOT here — they're
// read from runtime env on the server (see lib/maps-config.ts) and passed as
// props, so the production build needs no keys (works as a public add-on).

// AdvancedMarker requires a Map ID; this public demo ID renders markers when no
// real Map ID is configured.
export const DEMO_MAP_ID = "DEMO_MAP_ID";

// Center on south-central Texas (where the tracked family is) until data loads.
export const DEFAULT_CENTER = { lat: 29.7, lon: -97.9 };
