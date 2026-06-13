import { HA_BASE_URL, HA_TOKEN } from "./config";
import { getEntityMemberMap } from "./db";
import { pointToCurrent } from "./current";
import type { CurrentLocation, LocationPoint } from "./types";

// Live positions straight from Home Assistant. The Life360 integration updates
// device_tracker.life360_* entities every ~5s, so this is near-real-time —
// unlike the 15-min logger DB, which we keep for trip history.

interface HAState {
  entity_id: string;
  state: string;
  last_updated: string;
  attributes: Record<string, unknown>;
}

/** Where to reach HA: the Supervisor proxy inside a HAOS add-on, else a
 *  configured base URL + long-lived token (Mac dev / NAS). */
function endpoint(): { base: string; token: string } | null {
  const sup = process.env.SUPERVISOR_TOKEN;
  if (sup) return { base: "http://supervisor/core/api", token: sup };
  if (HA_BASE_URL && HA_TOKEN) {
    return { base: HA_BASE_URL.replace(/\/+$/, "") + "/api", token: HA_TOKEN };
  }
  return null;
}

export function liveConfigured(): boolean {
  return endpoint() !== null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" ? v : null;
const bool = (v: unknown): boolean | null =>
  v == null ? null : Boolean(v);

/**
 * Current positions for all known members from HA live state.
 * Returns null if HA isn't configured/reachable (caller falls back to the DB).
 */
export async function getLiveLocations(
  nowTs: number,
): Promise<CurrentLocation[] | null> {
  const ep = endpoint();
  if (!ep) return null;

  let states: HAState[];
  try {
    const res = await fetch(`${ep.base}/states`, {
      headers: { Authorization: `Bearer ${ep.token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    states = (await res.json()) as HAState[];
  } catch {
    return null;
  }

  const entityToMember = getEntityMemberMap();
  const out: CurrentLocation[] = [];
  for (const s of states) {
    const member = entityToMember[s.entity_id];
    if (!member) continue;
    const a = s.attributes ?? {};
    const lat = a.latitude;
    const lon = a.longitude;
    if (typeof lat !== "number" || typeof lon !== "number") continue;

    const point: LocationPoint = {
      ts: Math.floor(Date.parse(s.last_updated) / 1000) || nowTs,
      member,
      memberId: null,
      circle: null,
      state: s.state,
      lat,
      lon,
      battery: num(a.battery_level),
      gpsAccuracy: num(a.gps_accuracy),
      speed: num(a.speed),
      driving: bool(a.driving),
      batteryCharging: bool(a.battery_charging),
      wifiOn: bool(a.wifi_on),
      place: (a.place as string) ?? null,
      address: (a.address as string) ?? null,
    };
    out.push(pointToCurrent(point, nowTs));
  }

  if (out.length === 0) return null;
  return out.sort((x, y) => x.member.localeCompare(y.member));
}
