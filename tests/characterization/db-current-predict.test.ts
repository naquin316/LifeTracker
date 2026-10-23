// Characterization: the read-only locations mirror (lib/db.ts) and what the
// live map builds from it when HA is unreachable (lib/current.ts, lib/predict.ts).
// db.ts reads LOCATIONS_DB once at import, so every test imports it fresh.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localTs, makeLocationsDb, tempDir, type FixtureRow } from "./fixtures";

async function withDb(rows: FixtureRow[]) {
  const dir = tempDir("db");
  const file = makeLocationsDb(path.join(dir, "locations.db"), rows);
  process.env.LOCATIONS_DB = file;
  vi.resetModules();
  const db = await import("../../lib/db");
  const current = await import("../../lib/current");
  const predict = await import("../../lib/predict");
  return { dir, file, db, current, predict };
}

afterEach(() => {
  delete process.env.LOCATIONS_DB;
});

const T0 = 1_780_000_000;

describe("lib/db.ts against a fixture mirror", () => {
  // Life360 logs the same fix once per circle the member is in.
  const rows: FixtureRow[] = [
    { ts: T0, member: "Ryan", circle: "Family", lat: 30, lon: -97, entity_id: "device_tracker.life360_ryan" },
    { ts: T0, member: "Ryan", circle: "Work", lat: 30, lon: -97, entity_id: "device_tracker.life360_ryan" },
    { ts: T0 + 900, member: "Ryan", circle: "Family", lat: 30.1, lon: -97, entity_id: "device_tracker.life360_ryan" },
    { ts: T0 + 900, member: "Ryan", circle: "Work", lat: 30.1, lon: -97, entity_id: "device_tracker.life360_ryan" },
    { ts: T0 + 1800, member: "Ryan", circle: "Work", lat: 30.2, lon: -97, entity_id: "device_tracker.life360_ryan" },
    { ts: T0 + 600, member: "Emma", circle: "Family", lat: 29, lon: -98, gps_accuracy: null },
    { ts: T0 + 700, member: null as unknown as string, circle: "Family", lat: 1, lon: 1 },
  ];

  it("pins current behaviour: listMembers.count counts per-circle duplicates", async () => {
    const { db } = await withDb(rows);
    expect(db.listMembers()).toEqual([
      { member: "Emma", circles: ["Family"], primaryCircle: "Family", lastTs: T0 + 600, count: 1 },
      // Ryan has 3 distinct fixes but 5 logged rows; count reports 5.
      { member: "Ryan", circles: ["Family", "Work"], primaryCircle: "Work", lastTs: T0 + 1800, count: 5 },
    ]);
  });

  it("getPointsInRange is inclusive, time-ordered and de-duplicated across circles", async () => {
    const { db } = await withDb(rows);
    const pts = db.getPointsInRange("Ryan", T0, T0 + 900);
    expect(pts.map((p) => [p.ts, p.lat])).toEqual([
      [T0, 30],
      [T0 + 900, 30.1],
    ]);
    expect(pts[0]).toMatchObject({ member: "Ryan", gpsAccuracy: 10, driving: false, wifiOn: null });
    expect(db.getAllPoints("Ryan")).toHaveLength(3);
  });

  it("getLatestPerMember returns one row per named member and maps entities", async () => {
    const { db } = await withDb(rows);
    const latest = db.getLatestPerMember().sort((a, b) => a.member.localeCompare(b.member));
    expect(latest.map((p) => [p.member, p.ts])).toEqual([
      ["Emma", T0 + 600],
      ["Ryan", T0 + 1800],
    ]);
    expect(db.getEntityMemberMap()).toEqual({ "device_tracker.life360_ryan": "Ryan" });
  });

  it("buildCurrent: fresh+accurate is real, stale or unknown-accuracy is guessed", async () => {
    const { current } = await withDb(rows);
    const now = T0 + 1800 + 60; // Ryan 1 min old, Emma ~20 min old
    expect(
      current.buildCurrent(now).map((c) => [c.member, c.stale, c.confidence, c.ageSeconds, c.source]),
    ).toEqual([
      ["Emma", false, "guessed", 1260, "gps_fix"], // gps_accuracy NULL → never "real"
      ["Ryan", false, "real", 60, "gps_fix"],
    ]);
    const later = current.buildCurrent(T0 + 1800 + 31 * 60);
    expect(later.find((c) => c.member === "Ryan")).toMatchObject({ stale: true, confidence: "guessed" });
  });

  it("names the sync script when the mirror is missing", async () => {
    process.env.LOCATIONS_DB = "/nonexistent/lt-char/locations.db";
    vi.resetModules();
    const db = await import("../../lib/db");
    expect(() => db.listMembers()).toThrow(/Run scripts\/sync\.sh/);
  });

  it("pins current behaviour: the open handle never sees a re-synced file", async () => {
    // scripts/sync.sh replaces data/locations.db with `mv`; db.ts caches its
    // handle forever, so a running server keeps reading the old file.
    const { db, dir, file } = await withDb(rows);
    expect(db.getAllPoints("Ryan")).toHaveLength(3);
    const fresh = makeLocationsDb(path.join(dir, "new.db"), [
      ...rows,
      { ts: T0 + 2700, member: "Ryan", circle: "Work", lat: 30.3, lon: -97 },
    ]);
    fs.renameSync(fresh, file);
    expect(db.getAllPoints("Ryan")).toHaveLength(3); // still the pre-sync data
  });
});

describe("predictIfStale", () => {
  const A = { lat: 30.0, lon: -97.0 }; // where they always are at 23:30
  const B = { lat: 30.5, lon: -97.5 }; // a one-off just after midnight

  it("needs at least 10 fixes of history", async () => {
    const few = Array.from({ length: 9 }, (_, i) => ({ ts: T0 + i * 900, member: "M", ...A }));
    const { predict } = await withDb(few);
    expect(predict.predictIfStale("M", T0 + 86400)).toBeNull();
  });

  it("picks the most-visited ~111 m cell in the same hour-of-week", async () => {
    // Ten Tuesdays at 14:10 at A, three at 14:20 at B.
    const hist: FixtureRow[] = [];
    for (let k = 0; k < 10; k++) hist.push({ ts: localTs(2026, 1, 6 + 7 * k, 14, 10), member: "M", lat: A.lat + 0.0001 * (k % 3), lon: A.lon });
    for (let k = 0; k < 3; k++) hist.push({ ts: localTs(2026, 1, 6 + 7 * k, 14, 20), member: "M", ...B });
    const { predict } = await withDb(hist);
    const now = localTs(2026, 4, 14, 14, 30); // a later Tuesday 14:30
    const p = predict.predictIfStale("M", now)!;
    expect(p).toMatchObject({ member: "M", ts: now, stale: true, ageSeconds: 0, confidence: "guessed", source: "predicted", place: null });
    expect(p.lat).toBeCloseTo(A.lat + 0.0001 * 0.9, 6); // centroid of the A cluster
    expect(p.lon).toBeCloseTo(A.lon, 6);
  });

  it("the hour-of-day fallback wraps midnight", async () => {
    // Ten Wednesdays at 23:30 at A, one Thursday 00:15 at B. Asked about a
    // Monday 00:30, the weekly slice is empty, and the fallback keeps only
    // hours 23–1 (circular), so the ten 23:30 fixes at A outvote the one B fix.
    const hist: FixtureRow[] = [];
    for (let k = 0; k < 10; k++) hist.push({ ts: localTs(2025, 12, 31 - 7 * k, 23, 30), member: "M", ...A });
    hist.push({ ts: localTs(2026, 1, 8, 0, 15), member: "M", ...B });
    const { predict } = await withDb(hist);
    const p = predict.predictIfStale("M", localTs(2026, 1, 12, 0, 30))!;
    expect(p.lat).toBeCloseTo(A.lat, 6);
    expect(p.lon).toBeCloseTo(A.lon, 6);
  });
});
