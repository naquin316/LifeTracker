// Shared domain types for LifeTracker.

/** One raw GPS sample from the Life360 logger (one row of the `location` table). */
export interface LocationPoint {
  ts: number; // unix epoch seconds
  member: string;
  memberId: string | null;
  circle: string | null;
  state: string | null;
  lat: number;
  lon: number;
  battery: number | null;
  gpsAccuracy: number | null; // meters
  speed: number | null;
  driving: boolean | null;
  batteryCharging: boolean | null;
  wifiOn: boolean | null;
  place: string | null; // Life360's own saved label — we mostly ignore this for display
  address: string | null; // usually empty in the source data
}

export interface MemberInfo {
  member: string;
  circles: string[];
  primaryCircle: string | null; // circle of the most recent fix
  lastTs: number;
  count: number;
}

/** Confidence tier shown in the UI. */
export type Confidence = "real" | "guessed";

/** How a displayed location was derived. */
export type LocationSource =
  | "gps_fix" // an actual recorded sample
  | "places_match" // gps fix named via Google Places
  | "geofence" // named by a user-defined geofence (overrides Google)
  | "interpolated" // a position synthesized between samples (route reconstruction)
  | "predicted"; // estimated from history when the latest fix is stale

/** A resolved place name for a coordinate (the "best guess"). */
export interface ResolvedPlace {
  name: string | null;
  address: string | null;
  placeId: string | null;
  confidence: Confidence;
  source: LocationSource;
  alternatives: { name: string; placeId: string | null }[];
}

/** A user-defined named place that overrides Google's guess. */
export interface Geofence {
  name: string;
  lat: number;
  lon: number;
  radiusM: number;
  address?: string | null;
}

/** A member's current best-known position for the live map. */
export interface CurrentLocation {
  member: string;
  circle: string | null;
  ts: number; // timestamp of the underlying fix (or prediction "as of")
  lat: number;
  lon: number;
  battery: number | null;
  batteryCharging: boolean | null;
  driving: boolean | null;
  stale: boolean; // latest fix older than the freshness threshold
  ageSeconds: number;
  confidence: Confidence;
  source: LocationSource;
  place: ResolvedPlace | null;
}

/** A dwell: the member stayed within a small radius for a while. */
export interface Stay {
  startTs: number;
  endTs: number;
  durationSeconds: number;
  lat: number; // centroid
  lon: number;
  pointCount: number;
  place: ResolvedPlace | null;
}

/** A travel segment between two stays. */
export interface Move {
  startTs: number;
  endTs: number;
  durationSeconds: number;
  /** Time-stamped polyline for animation (snapped/interpolated when available). */
  path: { lat: number; lon: number; ts: number }[];
  distanceMeters: number;
  reconstructed: boolean; // true if road-snapped via Google, false if raw samples
}

export interface Trip {
  member: string;
  fromTs: number;
  toTs: number;
  stays: Stay[];
  moves: Move[];
}
