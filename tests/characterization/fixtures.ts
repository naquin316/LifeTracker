// Shared fixtures for the characterization tests. Everything here is synthetic:
// a throwaway SQLite file shaped like the Life360 logger's `location` table,
// built in a temp dir. Never point these tests at data/ or the HA box.
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LocationPoint } from "../../lib/types";

export interface FixtureRow {
  ts: number;
  member: string;
  lat: number;
  lon: number;
  circle?: string | null;
  entity_id?: string | null;
  gps_accuracy?: number | null;
  battery?: number | null;
  driving?: number | null;
}

export function tempDir(tag: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `lt-char-${tag}-`));
}

/** Write a locations DB with the columns lib/db.ts selects (plus entity_id). */
export function makeLocationsDb(file: string, rows: FixtureRow[]): string {
  fs.rmSync(file, { force: true });
  const db = new Database(file);
  db.exec(`CREATE TABLE location (
    ts INTEGER NOT NULL, member TEXT, member_id TEXT, circle TEXT, state TEXT,
    latitude REAL NOT NULL, longitude REAL NOT NULL, battery REAL,
    gps_accuracy REAL, speed REAL, driving INTEGER, battery_charging INTEGER,
    wifi_on INTEGER, place TEXT, address TEXT, entity_id TEXT
  )`);
  const ins = db.prepare(`INSERT INTO location
    (ts, member, circle, latitude, longitude, gps_accuracy, battery, driving, entity_id)
    VALUES (@ts, @member, @circle, @lat, @lon, @gps_accuracy, @battery, @driving, @entity_id)`);
  for (const r of rows) {
    ins.run({
      circle: null,
      entity_id: null,
      gps_accuracy: 10,
      battery: 80,
      driving: 0,
      ...r,
    });
  }
  db.close();
  return file;
}

/** A minimal LocationPoint, like lib/stays.test.ts builds. */
export function pt(ts: number, lat: number, lon: number): LocationPoint {
  return {
    ts,
    member: "Test",
    memberId: null,
    circle: null,
    state: null,
    lat,
    lon,
    battery: null,
    gpsAccuracy: 10,
    speed: null,
    driving: null,
    batteryCharging: null,
    wifiOn: null,
    place: null,
    address: null,
  };
}

/** Unix seconds for a LOCAL wall-clock time, so tests hold in any server TZ. */
export function localTs(y: number, mo: number, d: number, h: number, mi = 0): number {
  return Math.floor(new Date(y, mo - 1, d, h, mi).getTime() / 1000);
}

export const MIN = 60;
