// Characterization: the sidebar/replay labels (lib/format.ts) at their edges.
import { describe, expect, it } from "vitest";
import { formatDuration, relativeTime } from "../../lib/format";

describe("relativeTime", () => {
  it.each([
    [0, "just now"],
    [44, "just now"],
    [45, "1m ago"],
    [89, "1m ago"],
    [90, "2m ago"],
    [59 * 60 + 29, "59m ago"],
    [59 * 60 + 30, "1h ago"],
    [89 * 60, "1h ago"],
    [90 * 60, "2h ago"], // Math.round(1.5) rounds up
    [23.5 * 3600, "yesterday"],
    [36 * 3600, "2d ago"],
    [-500, "just now"], // future timestamps clamp to 0
  ])("%ss old → %s", (age, label) => {
    expect(relativeTime(1_000_000 - age, 1_000_000)).toBe(label);
  });
});

describe("formatDuration", () => {
  it.each([
    [29, "0 min"],
    [30, "1 min"],
    [59 * 60, "59 min"],
    [60 * 60, "1h"],
    [105 * 60, "1h 45m"],
    [24 * 3600 - 60, "23h 59m"],
    [24 * 3600, "1 day"],
    [35 * 3600, "1 day"],
    [36 * 3600, "2 days"],
  ])("%ss → %s", (s, label) => {
    expect(formatDuration(s)).toBe(label);
  });
});
