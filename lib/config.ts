// Tunable constants for analysis + freshness. Centralized so the heuristics
// are easy to adjust without hunting through modules.

/** A fix older than this (seconds) is considered stale → trigger prediction. */
export const STALE_SECONDS = 30 * 60;

/** Stay-point detection: max radius (m) a cluster of points may span. */
export const STAY_RADIUS_M = 80;

/** Stay-point detection: minimum dwell (seconds) to count as a stay. */
export const STAY_MIN_SECONDS = 10 * 60;

/** Below this gps_accuracy (m) a fix is trusted enough to be "real". */
export const GOOD_ACCURACY_M = 50;

/** Server-side Google key (geocoding/places/roads/directions). */
export const GOOGLE_SERVER_KEY = process.env.GOOGLE_MAPS_SERVER_KEY ?? "";

/** Home Assistant access for live positions (dev / non-add-on host).
 *  On a HAOS add-on, SUPERVISOR_TOKEN is used instead (see lib/halive.ts). */
export const HA_BASE_URL = process.env.HA_BASE_URL ?? "";
export const HA_TOKEN = process.env.HA_TOKEN ?? "";
