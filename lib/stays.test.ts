import { describe, expect, it } from "vitest";
import { detectStaysAndMoves, detectStayClusters } from "./stays";
import type { LocationPoint } from "./types";

// Build a minimal LocationPoint with sensible defaults.
function pt(ts: number, lat: number, lon: number): LocationPoint {
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

const MIN = 60;

describe("detectStayClusters", () => {
  it("detects a single dwell", () => {
    // 30 minutes sitting at one spot (jitter within ~20m).
    const pts: LocationPoint[] = [];
    for (let i = 0; i < 6; i++) {
      pts.push(pt(i * 5 * MIN, 30.0 + i * 0.00005, -90.0));
    }
    const clusters = detectStayClusters(pts);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].startIdx).toBe(0);
  });

  it("ignores a brief pass-through", () => {
    // Two nearby points only 2 minutes apart — below the 10-min threshold.
    const pts = [pt(0, 30.0, -90.0), pt(2 * MIN, 30.0001, -90.0)];
    expect(detectStayClusters(pts)).toHaveLength(0);
  });
});

describe("detectStaysAndMoves", () => {
  it("splits a dwell + a drive into one stay and one move", () => {
    const pts: LocationPoint[] = [];
    // Stay: 30 min at origin.
    for (let i = 0; i < 6; i++) pts.push(pt(i * 5 * MIN, 30.0, -90.0));
    // Drive away: points marching ~1km steps over the next 40 min.
    for (let i = 1; i <= 4; i++) {
      pts.push(pt(30 * MIN + i * 10 * MIN, 30.0 + i * 0.01, -90.0));
    }
    const { stays, moves } = detectStaysAndMoves(pts);
    expect(stays).toHaveLength(1);
    expect(stays[0].pointCount).toBe(6);
    expect(moves).toHaveLength(1);
    expect(moves[0].distanceMeters).toBeGreaterThan(1000);
    expect(moves[0].reconstructed).toBe(false);
  });

  it("returns nothing for empty input", () => {
    expect(detectStaysAndMoves([])).toEqual({ stays: [], moves: [] });
  });

  it("merges jitter-split dwells at the same place into one stay", () => {
    // ~2h at one venue, but a 120m GPS excursion mid-way splits the raw
    // clusters. After merging it should be a single stay, no spurious move.
    const pts: LocationPoint[] = [];
    for (let i = 0; i < 6; i++) pts.push(pt(i * 10 * MIN, 30.0, -90.0)); // 0–50min
    pts.push(pt(55 * MIN, 30.0011, -90.0)); // ~120m blip
    for (let i = 0; i < 6; i++) pts.push(pt((60 + i * 10) * MIN, 30.0, -90.0)); // 60–110min
    const { stays, moves } = detectStaysAndMoves(pts);
    expect(stays).toHaveLength(1);
    expect(stays[0].durationSeconds).toBeGreaterThan(90 * MIN);
    expect(moves).toHaveLength(0);
  });
});
