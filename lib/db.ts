import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { LocationPoint, MemberInfo } from "./types";

// The local read-only mirror produced by scripts/sync.sh.
const DB_PATH =
  process.env.LOCATIONS_DB ?? path.join(process.cwd(), "data", "locations.db");

let _db: Database.Database | null = null;

/** Open (and cache) the local locations DB, read-only. */
export function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `Locations DB not found at ${DB_PATH}. Run scripts/sync.sh to mirror it from the HA box.`,
    );
  }
  _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  return _db;
}

interface Row {
  ts: number;
  member: string;
  member_id: string | null;
  circle: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  battery: number | null;
  gps_accuracy: number | null;
  speed: number | null;
  driving: number | null;
  battery_charging: number | null;
  wifi_on: number | null;
  place: string | null;
  address: string | null;
}

const COLS = `ts, member, member_id, circle, state, latitude, longitude,
  battery, gps_accuracy, speed, driving, battery_charging, wifi_on, place, address`;

function toPoint(r: Row): LocationPoint {
  return {
    ts: r.ts,
    member: r.member,
    memberId: r.member_id,
    circle: r.circle,
    state: r.state,
    lat: r.latitude,
    lon: r.longitude,
    battery: r.battery,
    gpsAccuracy: r.gps_accuracy,
    speed: r.speed,
    driving: r.driving == null ? null : !!r.driving,
    batteryCharging: r.battery_charging == null ? null : !!r.battery_charging,
    wifiOn: r.wifi_on == null ? null : !!r.wifi_on,
    place: r.place,
    address: r.address,
  };
}

/**
 * List tracked members. Members can appear in several circles (one row per
 * circle per poll), so we collapse to one entry per person and report the
 * circle of their most recent fix as the primary.
 */
export function listMembers(): MemberInfo[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT member, circle, count(*) AS n, max(ts) AS last_ts
       FROM location
       WHERE member IS NOT NULL
       GROUP BY member, circle`,
    )
    .all() as { member: string; circle: string | null; n: number; last_ts: number }[];

  const byMember = new Map<string, MemberInfo>();
  for (const r of rows) {
    let info = byMember.get(r.member);
    if (!info) {
      info = {
        member: r.member,
        circles: [],
        primaryCircle: r.circle,
        lastTs: r.last_ts,
        count: 0,
      };
      byMember.set(r.member, info);
    }
    if (r.circle && !info.circles.includes(r.circle)) info.circles.push(r.circle);
    info.count += r.n;
    if (r.last_ts > info.lastTs) {
      info.lastTs = r.last_ts;
      info.primaryCircle = r.circle;
    }
  }
  return [...byMember.values()].sort((a, b) => a.member.localeCompare(b.member));
}

/** The most recent fix for every member (one row per person). */
export function getLatestPerMember(): LocationPoint[] {
  const db = getDb();
  // Latest ts per member, then one representative row at that ts (circles are
  // duplicates of the same fix, so any is fine — GROUP BY ts collapses them).
  const rows = db
    .prepare(
      `SELECT ${COLS} FROM location l
       JOIN (SELECT member AS m, max(ts) AS mts FROM location GROUP BY member) t
         ON l.member = t.m AND l.ts = t.mts
       GROUP BY l.member`,
    )
    .all() as Row[];
  return rows.map(toPoint);
}

/**
 * All fixes for one member within [fromTs, toTs], ordered by time and
 * de-duplicated across circles (the same GPS fix is logged once per circle).
 */
export function getPointsInRange(
  member: string,
  fromTs: number,
  toTs: number,
): LocationPoint[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ${COLS} FROM location
       WHERE member = ? AND ts BETWEEN ? AND ?
       GROUP BY ts
       ORDER BY ts ASC`,
    )
    .all(member, fromTs, toTs) as Row[];
  return rows.map(toPoint);
}

/** All fixes for a member (used by the predictor for historical patterns). */
export function getAllPoints(member: string): LocationPoint[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ${COLS} FROM location WHERE member = ? GROUP BY ts ORDER BY ts ASC`,
    )
    .all(member) as Row[];
  return rows.map(toPoint);
}
