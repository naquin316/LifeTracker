// Client-visible Google Maps config (NEXT_PUBLIC_* is inlined at build time).
export const BROWSER_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";

// AdvancedMarker requires a Map ID; fall back to Google's public demo ID for
// local dev so markers render even before a real Map ID is configured.
export const MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

export const hasBrowserKey = () => BROWSER_KEY.length > 0;

// Center on south-central Texas (where the tracked family is) until data loads.
export const DEFAULT_CENTER = { lat: 29.7, lon: -97.9 };
