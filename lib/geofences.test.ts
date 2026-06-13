import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { matchGeofence } from "./geofences";

const tmp = path.join(os.tmpdir(), "lt-places-test.json");

beforeEach(() => {
  fs.writeFileSync(
    tmp,
    JSON.stringify([
      { name: "Home", lat: 29.662078, lon: -98.142605, radiusM: 130 },
    ]),
  );
  process.env.PLACES_FILE = tmp;
});

afterEach(() => {
  delete process.env.PLACES_FILE;
  fs.rmSync(tmp, { force: true });
});

describe("matchGeofence", () => {
  it("names a point inside the fence", () => {
    // ~30m from center → inside the 130m radius.
    expect(matchGeofence(29.66232, -98.142605)?.name).toBe("Home");
  });
  it("returns null well outside the fence", () => {
    expect(matchGeofence(29.7, -98.1)).toBeNull();
  });
});
