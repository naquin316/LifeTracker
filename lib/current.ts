import { getLatestPerMember } from "./db";
import { GOOD_ACCURACY_M, STALE_SECONDS } from "./config";
import type { CurrentLocation, LocationPoint } from "./types";

/** Convert a member's latest raw fix into a CurrentLocation (no enrichment). */
export function pointToCurrent(p: LocationPoint, nowTs: number): CurrentLocation {
  const ageSeconds = Math.max(0, nowTs - p.ts);
  const stale = ageSeconds > STALE_SECONDS;
  const accurate = p.gpsAccuracy != null && p.gpsAccuracy <= GOOD_ACCURACY_M;
  return {
    member: p.member,
    circle: p.circle,
    ts: p.ts,
    lat: p.lat,
    lon: p.lon,
    battery: p.battery,
    batteryCharging: p.batteryCharging,
    driving: p.driving,
    stale,
    ageSeconds,
    // A fresh, accurate fix is "real"; an old or fuzzy one is "guessed".
    confidence: !stale && accurate ? "real" : "guessed",
    source: "gps_fix",
    place: null,
  };
}

/** Build the current-location list for every member. */
export function buildCurrent(nowTs: number): CurrentLocation[] {
  return getLatestPerMember()
    .map((p) => pointToCurrent(p, nowTs))
    .sort((a, b) => a.member.localeCompare(b.member));
}
