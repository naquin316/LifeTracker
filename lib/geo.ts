// Small geo helpers shared by stay-detection and route reconstruction.

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two lat/lon points, in meters. */
export function haversineMeters(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Mean of a list of coordinates (good enough at neighborhood scale). */
export function centroid(
  points: { lat: number; lon: number }[],
): { lat: number; lon: number } {
  if (points.length === 0) return { lat: 0, lon: 0 };
  let lat = 0;
  let lon = 0;
  for (const p of points) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / points.length, lon: lon / points.length };
}

/** Round a coordinate to a grid cell so nearby lookups share a cache key.
 *  precision 4 ≈ 11m, 3 ≈ 111m. Default 4 keeps Places results tight. */
export function gridKey(lat: number, lon: number, precision = 4): string {
  return `${lat.toFixed(precision)},${lon.toFixed(precision)}`;
}
