import type { Trip } from "./types";

export interface TimedPoint {
  ts: number;
  lat: number;
  lon: number;
}

export interface Timeline {
  samples: TimedPoint[]; // sorted, de-duped by ts
  minTs: number;
  maxTs: number;
}

/**
 * Flatten a trip into a single time-ordered position track for replay.
 * Move paths contribute their points; each stay contributes its centroid at
 * its start and end so the marker holds there during a dwell.
 */
export function buildTimeline(trip: Trip): Timeline {
  const pts: TimedPoint[] = [];
  for (const m of trip.moves) {
    for (const p of m.path) pts.push({ ts: p.ts, lat: p.lat, lon: p.lon });
  }
  for (const s of trip.stays) {
    pts.push({ ts: s.startTs, lat: s.lat, lon: s.lon });
    pts.push({ ts: s.endTs, lat: s.lat, lon: s.lon });
  }
  pts.sort((a, b) => a.ts - b.ts);

  // De-dupe identical timestamps (keep first).
  const samples: TimedPoint[] = [];
  for (const p of pts) {
    if (samples.length === 0 || samples[samples.length - 1].ts !== p.ts) {
      samples.push(p);
    }
  }
  return {
    samples,
    minTs: samples.length ? samples[0].ts : trip.fromTs,
    maxTs: samples.length ? samples[samples.length - 1].ts : trip.toTs,
  };
}

/** Interpolated position at time `t` along the timeline (null if empty). */
export function positionAt(
  samples: TimedPoint[],
  t: number,
): { lat: number; lon: number } | null {
  if (samples.length === 0) return null;
  if (t <= samples[0].ts) return { lat: samples[0].lat, lon: samples[0].lon };
  const last = samples[samples.length - 1];
  if (t >= last.ts) return { lat: last.lat, lon: last.lon };

  // Binary search for the segment containing t.
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].ts <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.ts - a.ts || 1;
  const f = (t - a.ts) / span;
  return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
}
