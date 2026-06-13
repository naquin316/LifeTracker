// Pure formatting helpers (safe in both server and client code).

/** "3m ago", "2h ago", "yesterday", etc. from a unix-seconds timestamp. */
export function relativeTime(ts: number, nowTs = Date.now() / 1000): string {
  const s = Math.max(0, Math.floor(nowTs - ts));
  if (s < 45) return "just now";
  if (s < 90) return "1m ago";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

/** "45 min", "1h 45m", "2 days" from a duration in seconds. */
export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 day" : `${d} days`;
}

/** Local clock time, e.g. "2:45 PM". */
export function clockTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Local date + time, e.g. "Jun 12, 2:45 PM". */
export function dateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Format a coordinate pair compactly. */
export function coords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
