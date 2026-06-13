import fs from "node:fs";
import path from "node:path";
import { haversineMeters } from "./geo";
import type { Geofence } from "./types";

// User-defined named places that override Google's guess. Managed in the UI
// (Live map → "+ Add place") or by editing data/places.json directly:
//
//   [
//     { "name": "Home",  "lat": 29.66208, "lon": -98.14260, "radiusM": 130 },
//     { "name": "Work",  "lat": 29.70,    "lon": -98.10,    "radiusM": 150 }
//   ]
//
// Any fix inside a geofence is named by it (no Google call), so it fixes
// mislabeled spots and saves an API request. The file is re-read when it
// changes — no restart needed.

export type { Geofence };

const placesFile = () =>
  process.env.PLACES_FILE ?? path.join(process.cwd(), "data", "places.json");

let cache: { mtimeMs: number; fences: Geofence[] } | null = null;

export function loadGeofences(): Geofence[] {
  const FILE = placesFile();
  try {
    const stat = fs.statSync(FILE);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.fences;
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Geofence[];
    const fences = Array.isArray(raw)
      ? raw.filter(
          (f) =>
            typeof f?.name === "string" &&
            Number.isFinite(f?.lat) &&
            Number.isFinite(f?.lon) &&
            Number.isFinite(f?.radiusM),
        )
      : [];
    cache = { mtimeMs: stat.mtimeMs, fences };
    return fences;
  } catch {
    // No file / bad JSON → no geofences.
    return [];
  }
}

/** The first geofence containing this coordinate, or null. */
export function matchGeofence(lat: number, lon: number): Geofence | null {
  for (const f of loadGeofences()) {
    if (haversineMeters(lat, lon, f.lat, f.lon) <= f.radiusM) return f;
  }
  return null;
}

/** Overwrite the geofence file (used by the management API). */
export function saveGeofences(fences: Geofence[]): void {
  const FILE = placesFile();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(fences, null, 2) + "\n", "utf8");
  cache = null; // invalidate so the next read reflects the write immediately
}
