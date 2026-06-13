"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import type { MemberInfo, Move, Stay, Trip } from "@/lib/types";
import { memberColor } from "@/lib/colors";
import { clockTime, coords, dateTime, formatDuration } from "@/lib/format";
import { buildTimeline, positionAt } from "@/lib/timeline";
import { DEFAULT_CENTER } from "./maps";
import { ConfidenceBadge } from "./ui";

// Playback speeds: trip-seconds advanced per real second.
const SPEEDS = [
  { label: "1m/s", v: 60 },
  { label: "5m/s", v: 300 },
  { label: "15m/s", v: 900 },
  { label: "1h/s", v: 3600 },
];

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return Math.floor(c.getTime() / 1000);
}

// datetime-local <-> unix seconds (in local time).
function toLocalInput(ts: number) {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string) {
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

export default function Replay({
  browserKey,
  mapId,
}: {
  browserKey: string;
  mapId: string;
}) {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [member, setMember] = useState("");
  const nowSec = Math.floor(Date.now() / 1000);
  const [from, setFrom] = useState(() => toLocalInput(nowSec - 24 * 3600));
  const [to, setTo] = useState(() => toLocalInput(nowSec));
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(300);
  const [playhead, setPlayhead] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => {
        if (d.members) {
          setMembers(d.members);
          if (!member && d.members[0]) setMember(d.members[0].member);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timeline = useMemo(() => (trip ? buildTimeline(trip) : null), [trip]);

  const preset = (kind: "today" | "yesterday" | "24h" | "3d") => {
    const now = Math.floor(Date.now() / 1000);
    const sod = startOfDay(new Date());
    if (kind === "today") {
      setFrom(toLocalInput(sod));
      setTo(toLocalInput(now));
    } else if (kind === "yesterday") {
      setFrom(toLocalInput(sod - 86400));
      setTo(toLocalInput(sod));
    } else if (kind === "24h") {
      setFrom(toLocalInput(now - 86400));
      setTo(toLocalInput(now));
    } else {
      setFrom(toLocalInput(now - 3 * 86400));
      setTo(toLocalInput(now));
    }
  };

  const loadTrip = useCallback(async () => {
    const f = fromLocalInput(from);
    const t = fromLocalInput(to);
    if (!member || f == null || t == null) return;
    setLoading(true);
    setError(null);
    setPlaying(false);
    try {
      const res = await fetch(`/api/trip?member=${encodeURIComponent(member)}&from=${f}&to=${t}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTrip(data as Trip);
      const tl = buildTimeline(data as Trip);
      setPlayhead(tl.minTs);
      setPanelOpen(false); // reveal the map on mobile after loading
    } catch (e) {
      setError((e as Error).message);
      setTrip(null);
    } finally {
      setLoading(false);
    }
  }, [member, from, to]);

  // Animation loop.
  const raf = useRef<number | null>(null);
  const lastFrame = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !timeline) return;
    const step = (now: number) => {
      if (lastFrame.current != null) {
        const dtSec = (now - lastFrame.current) / 1000;
        setPlayhead((p) => {
          const next = p + dtSec * speed;
          if (next >= timeline.maxTs) {
            setPlaying(false);
            return timeline.maxTs;
          }
          return next;
        });
      }
      lastFrame.current = now;
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      lastFrame.current = null;
    };
  }, [playing, speed, timeline]);

  const togglePlay = () => {
    if (!timeline) return;
    if (!playing && playhead >= timeline.maxTs) setPlayhead(timeline.minTs);
    setPlaying((p) => !p);
  };

  const color = member ? memberColor(member) : "#5b9dff";
  const marker = timeline ? positionAt(timeline.samples, playhead) : null;

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Controls + stops: static on desktop, slide-over on mobile */}
      <aside
        className={`scroll-thin absolute inset-y-0 left-0 z-30 flex w-80 max-w-[85vw] shrink-0 flex-col overflow-y-auto border-r border-border bg-panel transition-transform md:static md:z-auto md:max-w-none md:translate-x-0 ${
          panelOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col gap-3 p-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">
            Person
          </label>
          <select
            value={member}
            onChange={(e) => setMember(e.target.value)}
            className="rounded-md border border-border bg-panel-2 px-2.5 py-2 text-sm"
          >
            {members.map((m) => (
              <option key={m.member} value={m.member}>
                {m.member}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-1.5">
            {(["today", "yesterday", "24h", "3d"] as const).map((k) => (
              <button
                key={k}
                onClick={() => preset(k)}
                className="rounded-md border border-border bg-panel-2 px-2 py-1 text-[12px] text-muted hover:text-foreground"
              >
                {k === "24h" ? "24h" : k === "3d" ? "3 days" : k}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-muted">From</label>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-sm [color-scheme:dark]"
            />
            <label className="text-[11px] text-muted">To</label>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-sm [color-scheme:dark]"
            />
          </div>

          <button
            onClick={loadTrip}
            disabled={loading || !member}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load trip"}
          </button>
          {error && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              {error}
            </div>
          )}
        </div>

        {trip && (
          <div className="border-t border-border px-4 py-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Stops · {trip.stays.length}
            </div>
            <ol className="flex flex-col gap-2">
              {trip.stays.map((s, i) => (
                <StopItem key={s.startTs} stay={s} index={i} color={color} />
              ))}
              {trip.stays.length === 0 && (
                <li className="text-[12px] text-muted">
                  No dwell stops detected in this window.
                </li>
              )}
            </ol>
          </div>
        )}
      </aside>

      {/* Backdrop behind the mobile slide-over */}
      {panelOpen && (
        <button
          aria-label="Close controls"
          className="absolute inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* Map + transport bar */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          {/* Mobile toggle for the controls panel */}
          <button
            onClick={() => setPanelOpen((v) => !v)}
            aria-label="Toggle controls"
            className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-panel/90 px-3 py-2 text-sm shadow-lg backdrop-blur md:hidden"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z" />
            </svg>
            Controls
          </button>
          <APIProvider apiKey={browserKey}>
            <Map
              mapId={mapId}
              defaultCenter={{
                lat: DEFAULT_CENTER.lat,
                lng: DEFAULT_CENTER.lon,
              }}
              defaultZoom={10}
              gestureHandling="greedy"
              colorScheme="DARK"
              className="h-full w-full"
            >
              {trip && <MovesLayer moves={trip.moves} color={color} />}
              {trip?.stays.map((s, i) => (
                <AdvancedMarker
                  key={s.startTs}
                  position={{ lat: s.lat, lng: s.lon }}
                  title={s.place?.name ?? "stop"}
                >
                  <span
                    className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-black shadow"
                    style={{ backgroundColor: color }}
                  >
                    {i + 1}
                  </span>
                </AdvancedMarker>
              ))}
              {marker && (
                <AdvancedMarker
                  position={{ lat: marker.lat, lng: marker.lon }}
                  zIndex={1000}
                >
                  <span
                    className="block h-4 w-4 rounded-full border-2 border-white shadow-lg"
                    style={{ backgroundColor: color }}
                  />
                </AdvancedMarker>
              )}
              {trip && <FitTrip trip={trip} />}
            </Map>
          </APIProvider>

          {!trip && !loading && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <p className="rounded-lg bg-panel/80 px-4 py-2 text-sm text-muted">
                Pick a person and time range, then “Load trip”.
              </p>
            </div>
          )}
        </div>

        {timeline && (
          <div className="flex items-center gap-3 border-t border-border bg-panel px-4 py-3">
            <button
              onClick={togglePlay}
              className="grid h-9 w-9 place-items-center rounded-full bg-accent text-black"
              title={playing ? "Pause" : "Play"}
              aria-label={playing ? "Pause replay" : "Play replay"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <span className="w-28 shrink-0 font-mono text-[13px] tabular-nums">
              {clockTime(playhead)}
            </span>
            <input
              type="range"
              min={timeline.minTs}
              max={timeline.maxTs}
              value={playhead}
              aria-label="Scrub replay timeline"
              onChange={(e) => {
                setPlaying(false);
                setPlayhead(Number(e.target.value));
              }}
              className="flex-1 accent-[var(--accent)]"
            />
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="rounded-md border border-border bg-panel-2 px-2 py-1 text-[13px]"
            >
              {SPEEDS.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function StopItem({
  stay,
  index,
  color,
}: {
  stay: Stay;
  index: number;
  color: string;
}) {
  const label = stay.place?.name || stay.place?.address || coords(stay.lat, stay.lon);
  return (
    <li className="flex gap-2.5">
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-black"
        style={{ backgroundColor: color }}
      >
        {index + 1}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          {stay.place && <ConfidenceBadge confidence={stay.place.confidence} />}
        </div>
        <div className="text-[12px] text-muted">
          {dateTime(stay.startTs)} · {formatDuration(stay.durationSeconds)}
        </div>
      </div>
    </li>
  );
}

/** Draws move polylines on the map (solid when road-snapped, dashed when raw). */
function MovesLayer({ moves, color }: { moves: Move[]; color: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const lines = moves.map((m) => {
      const path = m.path.map((p) => ({ lat: p.lat, lng: p.lon }));
      if (m.reconstructed) {
        return new google.maps.Polyline({
          path,
          map,
          strokeColor: color,
          strokeOpacity: 0.95,
          strokeWeight: 4,
        });
      }
      // Dashed line to signal an approximate (un-snapped) segment.
      return new google.maps.Polyline({
        path,
        map,
        strokeOpacity: 0,
        icons: [
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeColor: color,
              strokeOpacity: 0.8,
              scale: 3,
            },
            offset: "0",
            repeat: "14px",
          },
        ],
      });
    });
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, moves, color]);
  return null;
}

/** Fit the map to the trip's extent whenever a new trip loads. */
function FitTrip({ trip }: { trip: Trip }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    let any = false;
    for (const m of trip.moves)
      for (const p of m.path) {
        bounds.extend({ lat: p.lat, lng: p.lon });
        any = true;
      }
    for (const s of trip.stays) {
      bounds.extend({ lat: s.lat, lng: s.lon });
      any = true;
    }
    if (any) map.fitBounds(bounds, 80);
  }, [map, trip]);
  return null;
}
