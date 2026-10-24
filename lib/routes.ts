import { createHash } from "node:crypto";
import { cached } from "./cache";
import { gridKey, haversineMeters } from "./geo";
import { snapToRoads } from "./google";
import type { Move } from "./types";

/** Distribute timestamps across a path proportional to distance traveled. */
function assignTimestamps(
  coords: { lat: number; lon: number }[],
  startTs: number,
  endTs: number,
): { lat: number; lon: number; ts: number }[] {
  if (coords.length === 0) return [];
  if (coords.length === 1) return [{ ...coords[0], ts: startTs }];

  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum[i] =
      cum[i - 1] +
      haversineMeters(
        coords[i - 1].lat,
        coords[i - 1].lon,
        coords[i].lat,
        coords[i].lon,
      );
  }
  const total = cum[cum.length - 1] || 1;
  const span = endTs - startTs;
  return coords.map((c, i) => ({
    ...c,
    ts: Math.round(startTs + (cum[i] / total) * span),
  }));
}

function cacheKey(move: Move): string {
  return createHash("sha1")
    .update(move.path.map((p) => gridKey(p.lat, p.lon)).join("|"))
    .digest("hex");
}

/**
 * Turn the sparse 15-min samples of a move into a smooth, road-snapped path
 * suitable for animation. Falls back to the raw samples if Google isn't
 * available. Cached by a hash of every sample (to ~11 m).
 */
export async function reconstructRoute(move: Move): Promise<Move> {
  const raw = move.path.map((p) => ({ lat: p.lat, lon: p.lon }));
  const snapped = await cached<{ lat: number; lon: number }[] | null>(
    "route",
    cacheKey(move),
    () => snapToRoads(raw),
    90 * 24 * 3600,
  );
  if (!snapped || snapped.length < 2) return move;

  const path = assignTimestamps(snapped, move.startTs, move.endTs);
  let distance = 0;
  for (let i = 1; i < path.length; i++) {
    distance += haversineMeters(
      path[i - 1].lat,
      path[i - 1].lon,
      path[i].lat,
      path[i].lon,
    );
  }
  return { ...move, path, distanceMeters: distance, reconstructed: true };
}
