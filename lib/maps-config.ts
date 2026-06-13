// Server-only resolver for the browser-facing Google Maps config. Reads runtime
// env so values can come from add-on options (GOOGLE_MAPS_*) without baking them
// into the build; falls back to NEXT_PUBLIC_* for local dev convenience.

export interface MapsConfig {
  browserKey: string;
  mapId: string;
}

export function getMapsConfig(): MapsConfig {
  const browserKey =
    process.env.GOOGLE_MAPS_BROWSER_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ||
    "";
  const mapId =
    process.env.GOOGLE_MAPS_MAP_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ||
    "DEMO_MAP_ID";
  return { browserKey, mapId };
}
