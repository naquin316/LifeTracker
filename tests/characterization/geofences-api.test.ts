// Characterization: the geofence file (lib/geofences.ts) and its management API
// (app/api/geofences/route.ts), which the Live map's Places panel calls.
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tempDir } from "./fixtures";

// The route imports "@/lib/geofences"; vitest has no "@" alias here (adding one
// would mean a config change), so forward the alias to the real module.
vi.mock("@/lib/geofences", async () => await import("../../lib/geofences"));

import { DELETE, GET, POST, PUT } from "../../app/api/geofences/route";
import { loadGeofences, matchGeofence } from "../../lib/geofences";

const HOME = { name: "Home", lat: 30.2672, lon: -97.7431, radiusM: 130 };
const WORK = { name: "Work", lat: 30.3, lon: -97.7, radiusM: 150 };

let file: string;
function writePlaces(v: unknown) {
  fs.writeFileSync(file, typeof v === "string" ? v : JSON.stringify(v));
}
const readPlaces = () => JSON.parse(fs.readFileSync(file, "utf8"));
const req = (url: string, init?: { method: string; body?: unknown }) =>
  new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

beforeEach(() => {
  // A new file per test keeps the mtime-keyed cache from leaking across tests.
  file = path.join(tempDir("places"), "places.json");
  process.env.PLACES_FILE = file;
});

describe("loadGeofences / matchGeofence", () => {
  it("keeps only well-formed fences; missing or bad JSON means none", () => {
    writePlaces([HOME, { name: "NoRadius", lat: 1, lon: 1 }, { lat: 1, lon: 1, radiusM: 5 }, WORK]);
    expect(loadGeofences().map((f) => f.name)).toEqual(["Home", "Work"]);
    fs.rmSync(file);
    expect(loadGeofences()).toEqual([]);
    writePlaces("{not json");
    expect(loadGeofences()).toEqual([]);
    writePlaces({ name: "object, not array" });
    expect(loadGeofences()).toEqual([]);
  });

  it("first match wins when fences overlap", () => {
    writePlaces([HOME, { ...HOME, name: "Inner", radiusM: 60 }]);
    expect(matchGeofence(HOME.lat, HOME.lon)?.name).toBe("Home");
  });

  it("pins current behaviour: the cache is keyed on mtime only", () => {
    writePlaces([HOME]);
    fs.utimesSync(file, 1_000_000, 1_000_000);
    expect(loadGeofences().map((f) => f.name)).toEqual(["Home"]);
    writePlaces([WORK]);
    fs.utimesSync(file, 1_000_000, 1_000_000); // same mtime, new content
    expect(loadGeofences().map((f) => f.name)).toEqual(["Home"]);
  });
});

describe("/api/geofences", () => {
  it("GET lists, POST appends with a 130 m default radius", async () => {
    writePlaces([HOME]);
    expect(await GET().json()).toEqual({ geofences: [HOME] });
    const res = await POST(req("/api/geofences", { method: "POST", body: { name: "  Gym ", lat: 30.1, lon: -97.1 } }));
    expect(res.status).toBe(200);
    expect(readPlaces()).toEqual([HOME, { name: "Gym", lat: 30.1, lon: -97.1, radiusM: 130, address: null }]);
  });

  it("POST rejects string coordinates and blank names", async () => {
    writePlaces([]);
    for (const body of [{ name: "X", lat: "30.1", lon: -97 }, { name: "  ", lat: 30, lon: -97 }]) {
      const res = await POST(req("/api/geofences", { method: "POST", body }));
      expect(res.status).toBe(400);
    }
    expect(readPlaces()).toEqual([]);
  });

  it("PUT replaces by index, keeps the old radius if none given, 404s out of range", async () => {
    writePlaces([HOME, WORK]);
    const ok = await PUT(req("/api/geofences?index=1", { method: "PUT", body: { name: "Office", lat: 30.31, lon: -97.71 } }));
    expect(ok.status).toBe(200);
    expect(readPlaces()[1]).toEqual({ name: "Office", lat: 30.31, lon: -97.71, radiusM: 150, address: null });
    const bad = await PUT(req("/api/geofences?index=5", { method: "PUT", body: { name: "X", lat: 1, lon: 1 } }));
    expect(bad.status).toBe(404);
  });

  it("DELETE removes by index", async () => {
    writePlaces([HOME, WORK]);
    const res = DELETE(req("/api/geofences?index=0", { method: "DELETE" }));
    expect((await res.json()).geofences).toEqual([WORK]);
    expect(readPlaces()).toEqual([WORK]);
  });

  it("DELETE with an empty or non-integer index is a 400 and touches nothing", async () => {
    writePlaces([HOME, WORK]);
    for (const q of ["", "%20", "-0", "-1", "1.5", "abc"]) {
      const res = DELETE(req(`/api/geofences?index=${q}`, { method: "DELETE" }));
      expect(res.status, q).toBe(400);
    }
    expect(readPlaces()).toEqual([HOME, WORK]);
  });

  it("PUT with an empty or non-integer index is a 400 and touches nothing", async () => {
    writePlaces([HOME, WORK]);
    for (const q of ["", "%20", "-0", "1.5", "abc"]) {
      const res = await PUT(req(`/api/geofences?index=${q}`, { method: "PUT", body: { name: "X", lat: 1, lon: 1 } }));
      expect(res.status, q).toBe(400);
    }
    expect(readPlaces()).toEqual([HOME, WORK]);
  });

  it("DELETE out of range is a 404 (same as PUT) and leaves the file alone", async () => {
    writePlaces([HOME]);
    const res = DELETE(req("/api/geofences?index=7", { method: "DELETE" }));
    expect(res.status).toBe(404);
    expect(readPlaces()).toEqual([HOME]);
  });

  it("DELETE without an index is a 400", async () => {
    writePlaces([HOME]);
    expect((DELETE(req("/api/geofences", { method: "DELETE" }))).status).toBe(400);
    expect(readPlaces()).toEqual([HOME]);
  });
});
