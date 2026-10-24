// Characterization: HA live positions (lib/halive.ts) and the two read
// endpoints the UI depends on, /api/current and /api/trip, run end to end over
// a fixture mirror with no Google key (the "degrades gracefully" path).
import path from "node:path";
import fs from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MIN, makeLocationsDb, tempDir, type FixtureRow } from "./fixtures";

// Route files import via the "@/..." alias, which vitest can't resolve without
// a config change; forward each alias to the real module. vi.resetModules keeps
// mocked modules, so the forwards are re-registered (doMock) on every fresh load.
const ALIASED = ["db", "current", "halive", "places", "predict", "stays", "routes", "config"] as const;
function forwardAliases() {
  for (const m of ALIASED) vi.doMock(`@/lib/${m}`, () => import(`../../lib/${m}`));
}

const ENV = ["LOCATIONS_DB", "CACHE_DB", "PLACES_FILE", "GOOGLE_MAPS_SERVER_KEY", "HA_BASE_URL", "HA_TOKEN", "SUPERVISOR_TOKEN"];
afterEach(() => {
  for (const k of ENV) delete process.env[k];
  vi.unstubAllGlobals();
});

async function setup(rows: FixtureRow[], env: Record<string, string> = {}, fences: unknown[] = []) {
  const dir = tempDir("live");
  process.env.LOCATIONS_DB = makeLocationsDb(path.join(dir, "locations.db"), rows);
  process.env.CACHE_DB = path.join(dir, "cache.db");
  process.env.PLACES_FILE = path.join(dir, "places.json");
  fs.writeFileSync(process.env.PLACES_FILE, JSON.stringify(fences));
  Object.assign(process.env, env);
  vi.resetModules();
  forwardAliases();
  return {
    halive: await import("../../lib/halive"),
    current: await import("../../app/api/current/route"),
    trip: await import("../../app/api/trip/route"),
  };
}

const ENTITY = "device_tracker.life360_ryan";
const now = Math.floor(Date.now() / 1000);

function haStates(states: unknown[]) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(states), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("getLiveLocations", () => {
  const rows: FixtureRow[] = [{ ts: now - 3600, member: "Ryan", lat: 30, lon: -97, entity_id: ENTITY }];

  it("is off without HA config", async () => {
    const { halive } = await setup(rows);
    expect(halive.liveConfigured()).toBe(false);
    expect(await halive.getLiveLocations(now)).toBeNull();
  });

  it("maps known life360 entities to members and skips the rest", async () => {
    const { halive } = await setup(rows, { HA_BASE_URL: "http://ha.local:8123//", HA_TOKEN: "t" });
    const fetch = haStates([
      {
        entity_id: ENTITY,
        state: "home",
        last_updated: new Date((now - 5) * 1000).toISOString(),
        attributes: { latitude: 30.1, longitude: -97.1, gps_accuracy: 8, battery_level: 55, driving: false },
      },
      { entity_id: "device_tracker.unknown", state: "x", last_updated: "", attributes: { latitude: 1, longitude: 1 } },
      { entity_id: ENTITY + "_2", state: "x", last_updated: "", attributes: {} },
    ]);
    const live = await halive.getLiveLocations(now);
    expect(fetch.mock.calls[0][0]).toBe("http://ha.local:8123/api/states");
    expect(fetch.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer t" });
    expect(live).toEqual([
      {
        member: "Ryan", circle: null, ts: now - 5, lat: 30.1, lon: -97.1, battery: 55,
        batteryCharging: null, driving: false, stale: false, ageSeconds: 5,
        confidence: "real", source: "gps_fix", place: null,
      },
    ]);
  });

  it("prefers the Supervisor proxy inside the add-on", async () => {
    const { halive } = await setup(rows, { SUPERVISOR_TOKEN: "sup", HA_BASE_URL: "http://x", HA_TOKEN: "t" });
    const fetch = haStates([]);
    expect(await halive.getLiveLocations(now)).toBeNull(); // no matches → null → DB fallback
    expect(fetch.mock.calls[0][0]).toBe("http://supervisor/core/api/states");
  });

  it("pins current behaviour: live positions still need the local mirror (entity map)", async () => {
    await setup(rows, { HA_BASE_URL: "http://x", HA_TOKEN: "t" });
    process.env.LOCATIONS_DB = "/nonexistent/lt-char.db";
    vi.resetModules();
    const fresh = await import("../../lib/halive");
    haStates([]);
    await expect(fresh.getLiveLocations(now)).rejects.toThrow(/Locations DB not found/);
  });
});

describe("GET /api/current (HA unreachable, no Google key)", () => {
  it("falls back to the mirror and names a fresh fix inside a geofence", async () => {
    const { current } = await setup(
      [{ ts: now - 60, member: "Ryan", lat: 30, lon: -97, entity_id: ENTITY }],
      {},
      [{ name: "Home", lat: 30, lon: -97, radiusM: 100 }],
    );
    const body = await (await current.GET()).json();
    expect(body.live).toBe(false);
    expect(body.locations).toHaveLength(1);
    expect(body.locations[0]).toMatchObject({
      member: "Ryan", stale: false, confidence: "real", source: "gps_fix",
      place: { name: "Home", source: "geofence", confidence: "real" },
    });
  });

  it("swaps a stale fix for the habit prediction", async () => {
    // 12 fixes at Home exactly 1, 2, … 12 weeks ago at this hour-of-week, plus
    // a 2-hour-old last fix elsewhere.
    const rows: FixtureRow[] = Array.from({ length: 12 }, (_, k) => ({
      ts: now - (k + 1) * 7 * 86400, member: "Ryan", lat: 30, lon: -97,
    }));
    rows.push({ ts: now - 7200, member: "Ryan", lat: 31, lon: -98 });
    const { current } = await setup(rows, {}, [{ name: "Home", lat: 30, lon: -97, radiusM: 100 }]);
    const [loc] = (await (await current.GET()).json()).locations;
    expect(loc).toMatchObject({
      source: "predicted", stale: true, confidence: "guessed", lat: 30, lon: -97,
      place: { name: "Home", confidence: "guessed" },
    });
  });

  it("returns 500 with the sync hint when the mirror is missing", async () => {
    await setup([]);
    process.env.LOCATIONS_DB = "/nonexistent/lt-char.db";
    vi.resetModules();
    forwardAliases();
    const fresh = await import("../../app/api/current/route");
    const res = await fresh.GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/scripts\/sync\.sh/);
  });
});

describe("GET /api/trip (no Google key)", () => {
  const T = 1_780_000_000;
  const rows: FixtureRow[] = [
    { ts: T, member: "Ryan", lat: 30, lon: -97, circle: "A" },
    { ts: T, member: "Ryan", lat: 30, lon: -97, circle: "B" },
    { ts: T + 15 * MIN, member: "Ryan", lat: 30, lon: -97 },
    { ts: T + 30 * MIN, member: "Ryan", lat: 30.02, lon: -97 },
    { ts: T + 45 * MIN, member: "Ryan", lat: 30.04, lon: -97 },
    { ts: T + 60 * MIN, member: "Ryan", lat: 30.04, lon: -97 },
  ];
  const get = (trip: { GET: (r: NextRequest) => Promise<Response> }, qs: string) =>
    trip.GET(new NextRequest(`http://localhost/api/trip?${qs}`));

  it("400s without member/from/to", async () => {
    const { trip } = await setup(rows);
    expect((await get(trip, "member=Ryan&from=1")).status).toBe(400);
    expect((await get(trip, "member=Ryan&from=abc&to=1")).status).toBe(400);
  });

  it("returns geofence-named stays and raw (unsnapped) moves", async () => {
    const { trip } = await setup(rows, {}, [{ name: "Home", lat: 30, lon: -97, radiusM: 100 }]);
    const body = await (await get(trip, `member=Ryan&from=${T}&to=${T + 3600}`)).json();
    expect(body.member).toBe("Ryan");
    expect(body.stays.map((s: { startTs: number; place: { name: string } | null }) => [s.startTs - T, s.place?.name ?? null])).toEqual([
      [0, "Home"],
      [45 * MIN, null], // no fence, no key → unnamed
    ]);
    expect(body.moves).toHaveLength(1);
    expect(body.moves[0].reconstructed).toBe(false);
    expect(body.moves[0].path).toHaveLength(3);
  });

  it("accepts ISO dates", async () => {
    const { trip } = await setup(rows);
    const iso = (s: number) => new Date(s * 1000).toISOString();
    const ok = await (await get(trip, `member=Ryan&from=${iso(T)}&to=${iso(T + 3600)}`)).json();
    expect(ok.stays).toHaveLength(2);
  });

  it("400s a reversed or empty window and one longer than 7 days", async () => {
    const { trip } = await setup(rows);
    const rev = await get(trip, `member=Ryan&from=${T + 3600}&to=${T}`);
    expect(rev.status).toBe(400);
    expect((await rev.json()).error).toMatch(/to must be after from/);
    expect((await get(trip, `member=Ryan&from=${T}&to=${T}`)).status).toBe(400);
    const long = await get(trip, `member=Ryan&from=${T}&to=${T + 8 * 86400}`);
    expect(long.status).toBe(400);
    expect((await long.json()).error).toMatch(/longer than 7 days/);
    expect((await get(trip, `member=Ryan&from=${T}&to=${T + 7 * 86400}`)).status).toBe(200);
  });
});
