import { GOOGLE_SERVER_KEY } from "./config";

// Thin server-side client for the Google Maps web-service APIs we need.
// Every function returns null on missing key or error so callers degrade
// gracefully (the app still works without Google, just without place names /
// road-snapping).

export const hasGoogleKey = () => GOOGLE_SERVER_KEY.length > 0;

// Cap concurrent outbound Google calls. Keeps cold-cache bursts (a fresh trip
// fans out dozens of place/road lookups) from spiking — easier on rate limits,
// cost, and the dev server's async tracking.
const MAX_CONCURRENT = 6;
let active = 0;
const waiters: (() => void)[] = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiters.push(resolve)).then(() => {
    active++;
  });
}

function release(): void {
  active--;
  waiters.shift()?.();
}

export interface GeocodeResult {
  address: string;
  placeId: string | null;
  types: string[];
}

export interface PlaceResult {
  name: string;
  placeId: string | null;
  vicinity: string | null;
  types: string[];
  lat: number;
  lon: number;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  await acquire();
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    release();
  }
}

/** Reverse-geocode a coordinate to a street address. */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<GeocodeResult | null> {
  if (!hasGoogleKey()) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_SERVER_KEY}`;
  const data = await getJson(url);
  const results = data?.results as
    | { formatted_address: string; place_id: string; types: string[] }[]
    | undefined;
  if (!results || results.length === 0) return null;
  const top = results[0];
  return {
    address: top.formatted_address,
    placeId: top.place_id ?? null,
    types: top.types ?? [],
  };
}

/**
 * Nearby named places (businesses/POIs) around a coordinate, nearest first.
 * Used to name a dwell spot ("best guess of the location").
 */
export async function nearbyPlaces(
  lat: number,
  lon: number,
  radiusM = 75,
): Promise<PlaceResult[]> {
  if (!hasGoogleKey()) return [];
  // rankby=prominence (the default, radius-bounded) favors the actual business
  // at a location over its ATM/vending sub-POIs and avoids pulling in a distant
  // POI when there's nothing here (e.g. a home) — unlike rankby=distance.
  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${lat},${lon}&radius=${radiusM}&key=${GOOGLE_SERVER_KEY}`;
  const data = await getJson(url);
  const results = data?.results as
    | {
        name: string;
        place_id: string;
        vicinity?: string;
        types?: string[];
        geometry?: { location?: { lat: number; lng: number } };
      }[]
    | undefined;
  if (!results) return [];
  return results.slice(0, 8).map((r) => ({
    name: r.name,
    placeId: r.place_id ?? null,
    vicinity: r.vicinity ?? null,
    types: r.types ?? [],
    lat: r.geometry?.location?.lat ?? lat,
    lon: r.geometry?.location?.lng ?? lon,
  }));
}

/** Snap a sequence of GPS points to roads. Returns null if unavailable. */
export async function snapToRoads(
  points: { lat: number; lon: number }[],
): Promise<{ lat: number; lon: number }[] | null> {
  if (!hasGoogleKey() || points.length === 0) return null;
  // Roads API caps at 100 points per request.
  const slice = points.slice(0, 100);
  const pathParam = slice.map((p) => `${p.lat},${p.lon}`).join("|");
  const url =
    `https://roads.googleapis.com/v1/snapToRoads` +
    `?interpolate=true&path=${encodeURIComponent(pathParam)}&key=${GOOGLE_SERVER_KEY}`;
  const data = await getJson(url);
  const snapped = data?.snappedPoints as
    | { location: { latitude: number; longitude: number } }[]
    | undefined;
  if (!snapped || snapped.length === 0) return null;
  return snapped.map((s) => ({
    lat: s.location.latitude,
    lon: s.location.longitude,
  }));
}

/**
 * Driving directions between two points; returns the decoded overview path.
 * Used to reconstruct a realistic route across a long gap between samples.
 */
export async function directionsPath(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<{ lat: number; lon: number }[] | null> {
  if (!hasGoogleKey()) return null;
  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}` +
    `&key=${GOOGLE_SERVER_KEY}`;
  const data = await getJson(url);
  const routes = data?.routes as
    | { overview_polyline?: { points: string } }[]
    | undefined;
  const encoded = routes?.[0]?.overview_polyline?.points;
  if (!encoded) return null;
  return decodePolyline(encoded);
}

/** Decode a Google encoded polyline into lat/lon points. */
export function decodePolyline(encoded: string): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lon: lng / 1e5 });
  }
  return points;
}
