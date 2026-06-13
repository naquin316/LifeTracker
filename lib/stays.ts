import { STAY_MIN_SECONDS, STAY_RADIUS_M } from "./config";
import { centroid, haversineMeters } from "./geo";
import type { LocationPoint, Move, Stay } from "./types";

interface Cluster {
  startIdx: number;
  endIdx: number; // inclusive
}

/**
 * Stay-point detection: walk the time-ordered fixes and group consecutive
 * points that stay within `radiusM` of the cluster anchor for at least
 * `minSec`. Those clusters are "stays" (dwells); everything between them is a
 * "move". This is the dwell detector behind place-guessing (the "sitting
 * somewhere for 2 hours" case).
 */
export function detectStayClusters(
  points: LocationPoint[],
  radiusM = STAY_RADIUS_M,
  minSec = STAY_MIN_SECONDS,
): Cluster[] {
  const clusters: Cluster[] = [];
  const n = points.length;
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (
      j < n &&
      haversineMeters(
        points[i].lat,
        points[i].lon,
        points[j].lat,
        points[j].lon,
      ) <= radiusM
    ) {
      j++;
    }
    const endIdx = j - 1;
    const span = points[endIdx].ts - points[i].ts;
    if (endIdx > i && span >= minSec) {
      clusters.push({ startIdx: i, endIdx });
      i = j;
    } else {
      i++;
    }
  }
  return clusters;
}

function spanCentroid(points: LocationPoint[], c: Cluster) {
  return centroid(
    points.slice(c.startIdx, c.endIdx + 1).map((p) => ({ lat: p.lat, lon: p.lon })),
  );
}

/**
 * Merge consecutive clusters whose centroids are within `radiusM` of each
 * other. GPS jitter often splits one long dwell into several clusters with
 * tiny excursions between them; this folds them back into a single stay (and
 * absorbs the jitter "moves"). A genuine errand farther than the radius is
 * left as separate stays.
 */
export function mergeClusters(
  points: LocationPoint[],
  clusters: Cluster[],
  radiusM = STAY_RADIUS_M,
): Cluster[] {
  const merged: Cluster[] = [];
  for (const c of clusters) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const a = spanCentroid(points, prev);
      const b = spanCentroid(points, c);
      if (haversineMeters(a.lat, a.lon, b.lat, b.lon) <= radiusM) {
        prev.endIdx = c.endIdx; // extend to absorb this cluster + the gap
        continue;
      }
    }
    merged.push({ ...c });
  }
  return merged;
}

function buildStay(points: LocationPoint[], c: Cluster): Stay {
  const slice = points.slice(c.startIdx, c.endIdx + 1);
  const ctr = centroid(slice.map((p) => ({ lat: p.lat, lon: p.lon })));
  return {
    startTs: slice[0].ts,
    endTs: slice[slice.length - 1].ts,
    durationSeconds: slice[slice.length - 1].ts - slice[0].ts,
    lat: ctr.lat,
    lon: ctr.lon,
    pointCount: slice.length,
    place: null, // filled by the caller via resolvePlace
  };
}

function pathDistance(path: { lat: number; lon: number }[]): number {
  let d = 0;
  for (let k = 1; k < path.length; k++) {
    d += haversineMeters(
      path[k - 1].lat,
      path[k - 1].lon,
      path[k].lat,
      path[k].lon,
    );
  }
  return d;
}

function buildMove(points: LocationPoint[], from: number, to: number): Move | null {
  const slice = points.slice(from, to + 1);
  if (slice.length < 2) return null;
  const path = slice.map((p) => ({ lat: p.lat, lon: p.lon, ts: p.ts }));
  const distance = pathDistance(path);
  if (distance < 30) return null; // didn't really go anywhere
  return {
    startTs: slice[0].ts,
    endTs: slice[slice.length - 1].ts,
    durationSeconds: slice[slice.length - 1].ts - slice[0].ts,
    path,
    distanceMeters: distance,
    reconstructed: false,
  };
}

/**
 * Split a member's time-ordered fixes into stays and the moves connecting them.
 * Moves include their bounding stay endpoints as anchors so paths join up.
 */
export function detectStaysAndMoves(points: LocationPoint[]): {
  stays: Stay[];
  moves: Move[];
} {
  if (points.length === 0) return { stays: [], moves: [] };

  const clusters = mergeClusters(points, detectStayClusters(points));
  const stays = clusters.map((c) => buildStay(points, c));

  const moves: Move[] = [];
  if (clusters.length === 0) {
    const m = buildMove(points, 0, points.length - 1);
    if (m) moves.push(m);
    return { stays, moves };
  }

  // Before the first stay.
  const head = buildMove(points, 0, clusters[0].startIdx);
  if (head) moves.push(head);

  // Between consecutive stays.
  for (let k = 0; k < clusters.length - 1; k++) {
    const m = buildMove(points, clusters[k].endIdx, clusters[k + 1].startIdx);
    if (m) moves.push(m);
  }

  // After the last stay.
  const tail = buildMove(
    points,
    clusters[clusters.length - 1].endIdx,
    points.length - 1,
  );
  if (tail) moves.push(tail);

  return { stays, moves };
}
