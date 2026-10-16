// Characterization: dwell detection + replay track, the core of /api/trip.
import { describe, expect, it } from "vitest";
import { detectStayClusters, detectStaysAndMoves } from "../../lib/stays";
import { buildTimeline, positionAt } from "../../lib/timeline";
import { haversineMeters } from "../../lib/geo";
import { MIN, pt } from "./fixtures";

// ~1 degree of latitude ≈ 111.2 km, so 0.0009° ≈ 100 m.
const HOME = { lat: 30.0, lon: -97.0 };

describe("stay detection on real-world 15-minute sampling", () => {
  it("two fixes 15 min apart at one spot are already a stay", () => {
    const { stays, moves } = detectStaysAndMoves([
      pt(0, HOME.lat, HOME.lon),
      pt(15 * MIN, HOME.lat + 0.0001, HOME.lon),
    ]);
    expect(stays).toHaveLength(1);
    expect(stays[0].durationSeconds).toBe(15 * MIN);
    expect(stays[0].pointCount).toBe(2);
    expect(moves).toHaveLength(0);
  });

  it("a single fix is neither a stay nor a move", () => {
    expect(detectStaysAndMoves([pt(0, HOME.lat, HOME.lon)])).toEqual({
      stays: [],
      moves: [],
    });
  });

  it("clusters are anchored on their first fix, so slow drift splits a dwell", () => {
    // Six fixes 5 min apart, each ~30 m north of the last: every neighbour is
    // close, but the anchor rule cuts the cluster once a fix is >80 m from the
    // first one.
    const pts = Array.from({ length: 6 }, (_, i) =>
      pt(i * 5 * MIN, HOME.lat + i * 0.00027, HOME.lon),
    );
    expect(detectStayClusters(pts)).toEqual([
      { startIdx: 0, endIdx: 2 },
      { startIdx: 3, endIdx: 5 },
    ]);
  });

  it("moves are anchored on the bounding stays' last/first fixes", () => {
    const pts = [
      pt(0, HOME.lat, HOME.lon),
      pt(15 * MIN, HOME.lat, HOME.lon),
      pt(30 * MIN, HOME.lat + 0.02, HOME.lon), // ~2.2 km away
      pt(45 * MIN, HOME.lat + 0.04, HOME.lon),
      pt(60 * MIN, HOME.lat + 0.04, HOME.lon),
    ];
    const { stays, moves } = detectStaysAndMoves(pts);
    expect(stays.map((s) => [s.startTs, s.endTs])).toEqual([
      [0, 15 * MIN],
      [45 * MIN, 60 * MIN],
    ]);
    expect(moves).toHaveLength(1);
    expect(moves[0].path.map((p) => p.ts)).toEqual([15 * MIN, 30 * MIN, 45 * MIN]);
    expect(moves[0].startTs).toBe(stays[0].endTs);
    expect(moves[0].endTs).toBe(stays[1].startTs);
    expect(moves[0].distanceMeters).toBeCloseTo(
      haversineMeters(HOME.lat, HOME.lon, HOME.lat + 0.04, HOME.lon),
      0,
    );
  });

  it("drops a move under 30 m as 'didn't really go anywhere'", () => {
    const pts = [pt(0, HOME.lat, HOME.lon), pt(5 * MIN, HOME.lat + 0.0002, HOME.lon)];
    expect(detectStaysAndMoves(pts)).toEqual({ stays: [], moves: [] });
  });

  it("pins current behaviour: a round trip with no stay in between is erased by the merge", () => {
    // Home 0–60 min, one fix 5 km away at 75 min (a short errand), home again
    // 90–150 min. The merge only compares the two home centroids, so the errand
    // vanishes: one stay, no moves, and the errand fix is counted inside it.
    const pts = [
      ...Array.from({ length: 7 }, (_, i) => pt(i * 10 * MIN, HOME.lat, HOME.lon)),
      pt(75 * MIN, HOME.lat + 0.045, HOME.lon),
      ...Array.from({ length: 7 }, (_, i) => pt((90 + i * 10) * MIN, HOME.lat, HOME.lon)),
    ];
    const { stays, moves } = detectStaysAndMoves(pts);
    expect(moves).toHaveLength(0);
    expect(stays).toHaveLength(1);
    expect(stays[0].startTs).toBe(0);
    expect(stays[0].endTs).toBe(150 * MIN);
    expect(stays[0].pointCount).toBe(15);
    // ...and the excursion drags the stay's centroid ~333 m off the house.
    const off = haversineMeters(HOME.lat, HOME.lon, stays[0].lat, stays[0].lon);
    expect(off).toBeGreaterThan(300);
    expect(off).toBeLessThan(350);
  });
});

describe("replay timeline", () => {
  it("pins current behaviour: at a shared timestamp the move's raw fix wins over the stay centroid", () => {
    // The stay's last fix (ts=15m) is ~39 m off its centroid; the move starts on
    // that raw fix, and buildTimeline keeps the first sample per ts (moves are
    // pushed first), so the marker jumps off the centroid as the dwell ends.
    const pts = [
      pt(0, HOME.lat, HOME.lon),
      pt(15 * MIN, HOME.lat + 0.0007, HOME.lon), // ~78 m from the first fix
      pt(30 * MIN, HOME.lat + 0.03, HOME.lon),
      pt(45 * MIN, HOME.lat + 0.06, HOME.lon),
      pt(60 * MIN, HOME.lat + 0.06, HOME.lon),
    ];
    const { stays, moves } = detectStaysAndMoves(pts);
    const tl = buildTimeline({ member: "Test", fromTs: 0, toTs: 60 * MIN, stays, moves });
    expect(tl.samples.map((s) => s.ts)).toEqual([0, 15 * MIN, 30 * MIN, 45 * MIN, 60 * MIN]);
    expect(tl.samples[0].lat).toBeCloseTo(stays[0].lat, 9); // centroid
    expect(tl.samples[1].lat).toBeCloseTo(HOME.lat + 0.0007, 9); // raw fix, not centroid
    expect(positionAt(tl.samples, 7.5 * MIN)!.lat).toBeCloseTo(
      (stays[0].lat + HOME.lat + 0.0007) / 2,
      9,
    );
  });

  it("an empty trip falls back to the requested window and positionAt is null", () => {
    const tl = buildTimeline({ member: "x", fromTs: 5, toTs: 9, stays: [], moves: [] });
    expect(tl).toEqual({ samples: [], minTs: 5, maxTs: 9 });
    expect(positionAt(tl.samples, 7)).toBeNull();
  });
});
