import { cached } from "./cache";
import { gridKey, haversineMeters } from "./geo";
import { matchGeofence } from "./geofences";
import { hasGoogleKey, nearbyPlaces, reverseGeocode } from "./google";
import type { LocationSource, ResolvedPlace } from "./types";

// Address types that mean we pinned an exact spot rather than a vague area.
const PRECISE_TYPES = new Set([
  "street_address",
  "premise",
  "subpremise",
  "establishment",
  "point_of_interest",
]);

// POI types worth naming as a "venue" (vs a plain road/locality).
const VENUE_TYPES = new Set([
  "store",
  "restaurant",
  "food",
  "gym",
  "school",
  "church",
  "park",
  "shopping_mall",
  "supermarket",
  "lodging",
  "cafe",
  "bar",
  "gas_station",
  "hospital",
  "doctor",
  "pharmacy",
  "bank",
  "library",
  "movie_theater",
  "stadium",
  "tourist_attraction",
  "amusement_park",
]);

// Sub-POIs / noise we never want as the headline name (an ATM inside a store,
// a parking lot, a single product listing, etc.).
const JUNK_TYPES = new Set([
  "atm",
  "parking",
  "post_box",
  "finance",
  "storage",
  "real_estate_agency",
]);

// A named venue must be at least this close to count as "where they are".
const VENUE_MAX_DISTANCE_M = 70;

export interface ResolveArgs {
  lat: number;
  lon: number;
  accuracy: number | null;
  source: LocationSource;
}

/**
 * Best-guess place for a coordinate. Combines a nearby-POI lookup (to name a
 * venue) with reverse-geocoding (for a street address), caches the result by
 * ~11m grid cell, and tags how confident the naming is.
 *
 * Returns null when there's no Google key configured (UI falls back to coords).
 */
export async function resolvePlace(
  args: ResolveArgs,
): Promise<ResolvedPlace | null> {
  // User-defined geofences win over Google (fixes mislabeled spots, no API call).
  const fence = matchGeofence(args.lat, args.lon);
  if (fence) {
    const guessed = args.source === "interpolated" || args.source === "predicted";
    return {
      name: fence.name,
      address: fence.address ?? null,
      placeId: null,
      confidence: guessed ? "guessed" : "real",
      source: "geofence",
      alternatives: [],
    };
  }

  if (!hasGoogleKey()) return null;

  const key = gridKey(args.lat, args.lon, 4);
  const resolved = await cached<ResolvedPlace | null>(
    "place",
    key,
    () => lookup(args.lat, args.lon),
    // Place names are stable; refresh monthly.
    30 * 24 * 3600,
  );
  if (!resolved) return null;

  // A synthesized position can never yield a "real" place, regardless of cache.
  if (args.source === "interpolated" || args.source === "predicted") {
    return { ...resolved, confidence: "guessed", source: args.source };
  }
  return resolved;
}

async function lookup(lat: number, lon: number): Promise<ResolvedPlace | null> {
  const [places, geo] = await Promise.all([
    nearbyPlaces(lat, lon),
    reverseGeocode(lat, lon),
  ]);

  // Real, close, non-junk venues only — nearest first.
  const venues = places
    .map((p) => ({ p, dist: haversineMeters(lat, lon, p.lat, p.lon) }))
    .filter(
      ({ p, dist }) =>
        dist <= VENUE_MAX_DISTANCE_M &&
        p.types.some((t) => VENUE_TYPES.has(t)) &&
        !p.types.some((t) => JUNK_TYPES.has(t)),
    )
    .sort((a, b) => a.dist - b.dist);

  const best = venues[0]?.p ?? null;
  const address = geo?.address ?? best?.vicinity ?? null;

  if (best) {
    // A genuine venue right here → name it. Very close ⇒ "real".
    return {
      name: best.name,
      address,
      placeId: best.placeId ?? geo?.placeId ?? null,
      confidence: venues[0].dist <= 40 ? "real" : "guessed",
      source: "places_match",
      alternatives: venues
        .slice(1, 4)
        .map(({ p }) => ({ name: p.name, placeId: p.placeId })),
    };
  }

  // No venue here (e.g. a home) → use the street address.
  if (address) {
    const precise = geo?.types.some((t) => PRECISE_TYPES.has(t)) ?? false;
    return {
      name: null,
      address,
      placeId: geo?.placeId ?? null,
      confidence: precise ? "real" : "guessed",
      source: "places_match",
      alternatives: [],
    };
  }

  return null;
}
