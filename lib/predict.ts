import { getAllPoints } from "./db";
import { centroid, gridKey } from "./geo";
import type { CurrentLocation, LocationPoint } from "./types";

/** Local hour-of-week (0..167) for a unix timestamp, in the server's timezone. */
function hourOfWeek(ts: number): number {
  const d = new Date(ts * 1000);
  return d.getDay() * 24 + d.getHours();
}

/** Circular distance between two hour-of-week values (wraps Sun↔Sat). */
function howDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 168 - diff);
}

/**
 * Estimate where a member probably is "now" when their latest fix is stale,
 * using historical habit: take past fixes that fall in the same hour-of-week
 * (±1h), bucket them into ~111m grid cells, and pick the most-visited cell.
 *
 * v1 heuristic — no ML. Returns null if there isn't enough history.
 */
export function predictIfStale(
  member: string,
  nowTs: number,
): CurrentLocation | null {
  const points = getAllPoints(member);
  if (points.length < 10) return null;

  const targetHow = hourOfWeek(nowTs);
  let candidates = points.filter((p) => howDistance(hourOfWeek(p.ts), targetHow) <= 1);
  // Fall back to same hour-of-day across all days if the weekly slice is thin.
  if (candidates.length < 5) {
    const targetHour = new Date(nowTs * 1000).getHours();
    candidates = points.filter(
      (p) => Math.abs(new Date(p.ts * 1000).getHours() - targetHour) <= 1,
    );
  }
  if (candidates.length === 0) return null;

  // Most frequent grid cell among the candidate fixes.
  const buckets = new Map<string, LocationPoint[]>();
  for (const p of candidates) {
    const k = gridKey(p.lat, p.lon, 3);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(p);
  }
  let best: LocationPoint[] = [];
  for (const group of buckets.values()) {
    if (group.length > best.length) best = group;
  }
  if (best.length === 0) return null;

  const ctr = centroid(best.map((p) => ({ lat: p.lat, lon: p.lon })));
  return {
    member,
    circle: null,
    ts: nowTs,
    lat: ctr.lat,
    lon: ctr.lon,
    battery: null,
    batteryCharging: null,
    driving: null,
    stale: true,
    ageSeconds: 0,
    confidence: "guessed",
    source: "predicted",
    place: null,
  };
}
