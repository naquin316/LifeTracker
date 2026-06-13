import { describe, expect, it } from "vitest";
import { buildTimeline, positionAt } from "./timeline";
import type { Trip } from "./types";

const trip: Trip = {
  member: "Test",
  fromTs: 0,
  toTs: 1000,
  stays: [
    {
      startTs: 0,
      endTs: 100,
      durationSeconds: 100,
      lat: 10,
      lon: 20,
      pointCount: 3,
      place: null,
    },
  ],
  moves: [
    {
      startTs: 100,
      endTs: 200,
      durationSeconds: 100,
      path: [
        { lat: 10, lon: 20, ts: 100 },
        { lat: 12, lon: 20, ts: 200 },
      ],
      distanceMeters: 2000,
      reconstructed: true,
    },
  ],
};

describe("buildTimeline", () => {
  it("merges stays and moves into a sorted track", () => {
    const tl = buildTimeline(trip);
    expect(tl.minTs).toBe(0);
    expect(tl.maxTs).toBe(200);
    expect(tl.samples.map((s) => s.ts)).toEqual([0, 100, 200]);
  });
});

describe("positionAt", () => {
  const tl = buildTimeline(trip);
  it("clamps before start and after end", () => {
    expect(positionAt(tl.samples, -50)).toEqual({ lat: 10, lon: 20 });
    expect(positionAt(tl.samples, 999)).toEqual({ lat: 12, lon: 20 });
  });
  it("interpolates mid-segment", () => {
    const p = positionAt(tl.samples, 150); // halfway through the move
    expect(p?.lat).toBeCloseTo(11, 5);
    expect(p?.lon).toBeCloseTo(20, 5);
  });
  it("holds position during a dwell", () => {
    expect(positionAt(tl.samples, 50)).toEqual({ lat: 10, lon: 20 });
  });
});
