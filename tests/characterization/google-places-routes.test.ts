// Characterization: venue naming (lib/places.ts), road snapping (lib/routes.ts)
// and the Google client (lib/google.ts). Google is faked at `fetch` with canned
// JSON; the cache is a throwaway SQLite file. config.ts reads the key at import,
// so modules are imported fresh after the env is set.
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN, tempDir } from "./fixtures";
import type { Move } from "../../lib/types";

type Json = Record<string, unknown>;
let geocode: Json;
let nearby: Json;
let calls: URL[];

function fakeGoogle(input: string | URL | Request): Promise<Response> {
  const url = new URL(String(input));
  calls.push(url);
  let body: Json = {};
  if (url.pathname.includes("/geocode/")) body = geocode;
  else if (url.pathname.includes("/nearbysearch/")) body = nearby;
  else if (url.pathname.includes("snapToRoads")) {
    // Echo the requested path back as "snapped" points.
    body = {
      snappedPoints: url.searchParams.get("path")!.split("|").map((pair) => {
        const [latitude, longitude] = pair.split(",").map(Number);
        return { location: { latitude, longitude } };
      }),
    };
  }
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

async function load(key: string) {
  const dir = tempDir("google");
  process.env.GOOGLE_MAPS_SERVER_KEY = key;
  process.env.CACHE_DB = path.join(dir, "cache.db");
  process.env.PLACES_FILE = path.join(dir, "places.json"); // absent → no fences
  vi.resetModules();
  return {
    dir,
    places: await import("../../lib/places"),
    routes: await import("../../lib/routes"),
    google: await import("../../lib/google"),
    cache: await import("../../lib/cache"),
  };
}

beforeEach(() => {
  calls = [];
  geocode = { results: [] };
  nearby = { results: [] };
  vi.stubGlobal("fetch", vi.fn(fakeGoogle));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  delete process.env.CACHE_DB;
  delete process.env.PLACES_FILE;
});

const HERE = { lat: 30.0, lon: -97.0 };
// 0.00009° lat ≈ 10 m north.
const north = (m: number) => ({ lat: HERE.lat + (m / 10) * 0.00009, lng: HERE.lon });
const poi = (name: string, types: string[], m: number) => ({
  name,
  place_id: `pid-${name}`,
  vicinity: `${name} vicinity`,
  types,
  geometry: { location: north(m) },
});

describe("resolvePlace", () => {
  it("names the nearest real venue within 70 m, skipping junk and non-venues", async () => {
    const { places } = await load("k");
    nearby = {
      results: [
        poi("Chase ATM", ["atm", "finance", "store"], 5),
        poi("Some Road", ["route"], 8),
        poi("H-E-B", ["supermarket", "store"], 30),
        poi("Cafe", ["cafe"], 60),
        poi("Far Diner", ["restaurant"], 100),
      ],
    };
    geocode = { results: [{ formatted_address: "1 Main St", place_id: "g1", types: ["street_address"] }] };
    expect(await places.resolvePlace({ ...HERE, accuracy: null, source: "gps_fix" })).toEqual({
      name: "H-E-B",
      address: "1 Main St",
      placeId: "pid-H-E-B",
      confidence: "real", // ≤40 m
      source: "places_match",
      alternatives: [{ name: "Cafe", placeId: "pid-Cafe" }],
    });
  });

  it("a venue 41–70 m away is only 'guessed'", async () => {
    const { places } = await load("k");
    nearby = { results: [poi("Cafe", ["cafe"], 60)] };
    const p = await places.resolvePlace({ ...HERE, accuracy: null, source: "gps_fix" });
    expect(p).toMatchObject({ name: "Cafe", confidence: "guessed", address: "Cafe vicinity" });
  });

  it("no venue → street address; precise geocode types are 'real', others 'guessed'", async () => {
    const { places } = await load("k");
    geocode = { results: [{ formatted_address: "12 Oak St", place_id: "g2", types: ["premise"] }] };
    expect(await places.resolvePlace({ ...HERE, accuracy: null, source: "gps_fix" })).toEqual({
      name: null,
      address: "12 Oak St",
      placeId: "g2",
      confidence: "real",
      source: "places_match",
      alternatives: [],
    });
    geocode = { results: [{ formatted_address: "Austin, TX", place_id: "g3", types: ["locality"] }] };
    const vague = await places.resolvePlace({ lat: 31, lon: -98, accuracy: null, source: "gps_fix" });
    expect(vague).toMatchObject({ address: "Austin, TX", confidence: "guessed" });
  });

  it("caches by ~11 m cell and downgrades synthesized positions to guessed", async () => {
    const { places } = await load("k");
    nearby = { results: [poi("H-E-B", ["supermarket"], 10)] };
    await places.resolvePlace({ ...HERE, accuracy: null, source: "gps_fix" });
    const n = calls.length;
    const again = await places.resolvePlace({ lat: HERE.lat + 0.00001, lon: HERE.lon, accuracy: null, source: "predicted" });
    expect(calls.length).toBe(n); // served from cache.db
    expect(again).toMatchObject({ name: "H-E-B", confidence: "guessed", source: "predicted" });
  });

  it("an empty answer is not cached, so it re-bills every time", async () => {
    const { places } = await load("k");
    expect(await places.resolvePlace({ ...HERE, accuracy: null, source: "gps_fix" })).toBeNull();
    expect(await places.resolvePlace({ ...HERE, accuracy: null, source: "gps_fix" })).toBeNull();
    expect(calls).toHaveLength(4); // nearby + geocode, twice
  });

  it("without a server key returns null and never calls Google", async () => {
    const { places } = await load("");
    expect(await places.resolvePlace({ ...HERE, accuracy: null, source: "gps_fix" })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("decodePolyline", () => {
  it("decodes Google's documented example", async () => {
    const { google } = await load("");
    expect(google.decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
  });
});

function move(n: number, lonStep = 0): Move {
  const path = Array.from({ length: n }, (_, i) => ({
    lat: HERE.lat + i * 0.001,
    lon: HERE.lon + (i > 0 && i < n - 1 ? lonStep : 0),
    ts: i * MIN,
  }));
  return { startTs: 0, endTs: (n - 1) * MIN, durationSeconds: (n - 1) * MIN, path, distanceMeters: 0, reconstructed: false };
}

describe("reconstructRoute", () => {
  it("without Google the raw move comes back untouched", async () => {
    const { routes } = await load("");
    const m = move(5);
    expect(await routes.reconstructRoute(m)).toBe(m);
  });

  it("re-times the snapped path by distance across the move's window", async () => {
    const { routes } = await load("k");
    const r = await routes.reconstructRoute(move(5));
    expect(r.reconstructed).toBe(true);
    expect(r.path.map((p) => p.ts)).toEqual([0, 60, 120, 180, 240]);
    expect(r.distanceMeters).toBeCloseTo(4 * 111.2, -1);
  });

  it("snaps a long drive in 100-point chunks and stitches the whole path", async () => {
    const { routes } = await load("k");
    const r = await routes.reconstructRoute(move(150));
    expect(r.path).toHaveLength(150);
    const last = r.path[r.path.length - 1];
    expect(last.lat).toBeCloseTo(HERE.lat + 149 * 0.001, 9); // the real final fix
    expect(last.ts).toBe(149 * MIN);
    expect(calls.filter((c) => String(c).includes("snapToRoads"))).toHaveLength(2);
  });

  it("two different routes with the same endpoints and fix count get their own path; the same route is cached", async () => {
    const { routes } = await load("k");
    const first = await routes.reconstructRoute(move(4));
    const detour = await routes.reconstructRoute(move(4, 0.05)); // ~5 km east mid-route
    expect(calls).toHaveLength(2); // the detour went to Google itself
    expect(detour.path).not.toEqual(first.path);
    await routes.reconstructRoute(move(4));
    expect(calls).toHaveLength(2); // an identical drive is a cache hit
  });
});
