"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import type { CurrentLocation, Geofence, MemberInfo } from "@/lib/types";
import { memberColor } from "@/lib/colors";
import { clockTime, coords, relativeTime } from "@/lib/format";
import { DEFAULT_CENTER } from "./maps";
import { Battery, ConfidenceBadge } from "./ui";
import Sidebar from "./Sidebar";

const POLL_MS = 20_000;

export default function LiveMap({
  browserKey,
  mapId,
}: {
  browserKey: string;
  mapId: string;
}) {
  const [locations, setLocations] = useState<CurrentLocation[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Geofences (named places)
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<{
    lat: number;
    lon: number;
    radiusM: number;
  } | null>(null);
  const [editing, setEditing] = useState<
    (Geofence & { index: number }) | null
  >(null);
  // Set only when a place is selected (not on drag) so we zoom once, not per-drag.
  const [focusTarget, setFocusTarget] = useState<Geofence | null>(null);

  const loadGeofences = useCallback(async () => {
    try {
      const r = await fetch("/api/geofences", { cache: "no-store" });
      const d = await r.json();
      if (d.geofences) setGeofences(d.geofences);
    } catch {
      /* ignore */
    }
  }, []);

  const saveGeofence = async (g: Geofence) => {
    await fetch("/api/geofences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(g),
    });
    setDraft(null);
    await Promise.all([loadGeofences(), load()]); // refresh names on the map
  };

  const deleteGeofence = async (index: number) => {
    await fetch(`/api/geofences?index=${index}`, { method: "DELETE" });
    setEditing(null);
    await Promise.all([loadGeofences(), load()]);
  };

  const selectPlace = (index: number) => {
    const g = geofences[index];
    if (!g) return;
    setSelected(null);
    setDraft(null);
    setPlacing(false);
    setEditing({ ...g, index });
    setFocusTarget({ ...g }); // fresh object → re-zooms even if re-selected
    setSidebarOpen(false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { index, name, lat, lon, radiusM, address } = editing;
    await fetch(`/api/geofences?index=${index}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), lat, lon, radiusM, address }),
    });
    setEditing(null);
    await Promise.all([loadGeofences(), load()]);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/current", { cache: "no-store" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLocations(data.locations);
      setNow(data.now);
      setLive(!!data.live);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => d.members && setMembers(d.members))
      .catch(() => {});
    loadGeofences();
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load, loadGeofences]);

  const toggle = (member: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(member) ? next.delete(member) : next.add(member);
      return next;
    });

  const visible = useMemo(
    () => locations.filter((l) => !hidden.has(l.member)),
    [locations, hidden],
  );
  const selectedLoc = locations.find((l) => l.member === selected) ?? null;

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Sidebar: static on desktop, slide-over on mobile */}
      <div
        className={`absolute inset-y-0 left-0 z-30 transition-transform md:static md:z-auto md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          locations={locations}
          members={members}
          hidden={hidden}
          selected={selected}
          now={now}
          error={error}
          live={live}
          geofences={geofences}
          placing={placing}
          onToggle={toggle}
          onSelect={(m) => {
            setSelected(m);
            setSidebarOpen(false);
          }}
          onAddPlace={() => {
            setPlacing(true);
            setEditing(null);
            setSidebarOpen(false);
          }}
          onDeletePlace={deleteGeofence}
          onSelectPlace={selectPlace}
          editingIndex={editing?.index ?? null}
        />
      </div>

      {/* Backdrop behind the mobile slide-over */}
      {sidebarOpen && (
        <button
          aria-label="Close people list"
          className="absolute inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="relative min-h-0 flex-1">
        {/* Mobile toggle for the people list */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle people list"
          className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-panel/90 px-3 py-2 text-sm shadow-lg backdrop-blur md:hidden"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z" />
          </svg>
          People
        </button>

        {/* First-load overlay */}
        {!loaded && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/60">
            <div className="flex items-center gap-2 rounded-lg bg-panel/90 px-4 py-2 text-sm text-muted">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
              Locating family…
            </div>
          </div>
        )}

        <APIProvider apiKey={browserKey}>
          <Map
            mapId={mapId}
            defaultCenter={{ lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lon }}
            defaultZoom={9}
            gestureHandling="greedy"
            disableDefaultUI={false}
            colorScheme="DARK"
            className="h-full w-full"
            onClick={(e) => {
              if (placing && e.detail.latLng) {
                setDraft({
                  lat: e.detail.latLng.lat,
                  lon: e.detail.latLng.lng,
                  radiusM: 130,
                });
                setPlacing(false);
              } else {
                setSelected(null);
              }
            }}
          >
            {visible.map((loc) => (
              <MemberMarker
                key={loc.member}
                loc={loc}
                active={loc.member === selected}
                onClick={() => setSelected(loc.member)}
              />
            ))}

            <GeofenceCircles
              geofences={geofences}
              draft={draft}
              editing={editing}
            />

            {selectedLoc && !draft && !editing && (
              <MemberPopup
                loc={selectedLoc}
                now={now}
                onClose={() => setSelected(null)}
              />
            )}

            {draft && (
              <GeofenceForm
                draft={draft}
                onRadiusChange={(radiusM) =>
                  setDraft((p) => (p ? { ...p, radiusM } : p))
                }
                onSave={saveGeofence}
                onCancel={() => setDraft(null)}
              />
            )}

            {/* Draggable center handle while editing a place */}
            {editing && (
              <AdvancedMarker
                position={{ lat: editing.lat, lng: editing.lon }}
                draggable
                zIndex={3000}
                onDrag={(e) => {
                  const ll = e.latLng;
                  if (ll)
                    setEditing((prev) =>
                      prev ? { ...prev, lat: ll.lat(), lon: ll.lng() } : prev,
                    );
                }}
              >
                <span
                  className="block h-5 w-5 cursor-move rounded-full border-2 border-white bg-guessed shadow-lg"
                  title="Drag to move"
                />
              </AdvancedMarker>
            )}

            <FitBounds locations={visible} focus={selectedLoc} />
            <FocusCircle target={focusTarget} />
          </Map>
        </APIProvider>

        {/* Edit panel while editing a place */}
        {editing && (
          <div className="absolute right-3 top-3 z-20 w-64 rounded-xl border border-border bg-panel/95 p-3 text-foreground shadow-2xl backdrop-blur">
            <div className="mb-2 text-sm font-semibold">Edit place</div>
            <input
              value={editing.name}
              onChange={(e) =>
                setEditing((p) => (p ? { ...p, name: e.target.value } : p))
              }
              placeholder="Name"
              className="mb-2.5 w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
            <label className="mb-1 flex items-center justify-between text-[12px] text-muted">
              Radius
              <span className="tabular-nums text-foreground">
                {editing.radiusM} m
              </span>
            </label>
            <input
              type="range"
              min={50}
              max={400}
              step={10}
              value={editing.radiusM}
              aria-label="Geofence radius in meters"
              onChange={(e) =>
                setEditing((p) =>
                  p ? { ...p, radiusM: Number(e.target.value) } : p,
                )
              }
              className="mb-2 w-full accent-[var(--accent)]"
            />
            <p className="mb-3 text-[11px] text-muted">
              Drag the amber marker on the map to move it.
            </p>
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={!editing.name.trim()}
                className="flex-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => deleteGeofence(editing.index)}
                className="rounded-md border border-border px-2.5 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
              >
                Delete
              </button>
              <button
                onClick={() => setEditing(null)}
                className="rounded-md border border-border px-2.5 py-1.5 text-sm text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Banner while choosing a spot for a new place */}
        {placing && (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-lg border border-accent/40 bg-panel/95 px-4 py-2 text-sm shadow-lg backdrop-blur">
            Tap the map to drop a place ·{" "}
            <button
              className="text-accent underline"
              onClick={() => setPlacing(false)}
            >
              cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberMarker({
  loc,
  active,
  onClick,
}: {
  loc: CurrentLocation;
  active: boolean;
  onClick: () => void;
}) {
  const color = memberColor(loc.member);
  const real = loc.confidence === "real";
  const initials = loc.member
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AdvancedMarker
      position={{ lat: loc.lat, lng: loc.lon }}
      onClick={onClick}
      zIndex={active ? 1000 : 1}
      title={loc.member}
    >
      <div className="relative grid place-items-center">
        {real && (
          <span
            className="pulse-ring absolute h-6 w-6 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span
          className="relative grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-black shadow-lg"
          style={{
            backgroundColor: color,
            border: active ? "2px solid #fff" : "2px solid rgba(0,0,0,.35)",
            opacity: real ? 1 : 0.6,
            outline: real ? "none" : `2px dashed ${color}`,
            outlineOffset: "2px",
          }}
        >
          {initials}
        </span>
      </div>
    </AdvancedMarker>
  );
}

/** A custom dark-theme popup anchored above the member's marker. Replaces the
 *  default white Google InfoWindow, which rendered our light text illegibly. */
function MemberPopup({
  loc,
  now,
  onClose,
}: {
  loc: CurrentLocation;
  now: number;
  onClose: () => void;
}) {
  const color = memberColor(loc.member);
  const initials = loc.member
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const placeName = loc.place?.name ?? null;
  const address = loc.place?.address ?? (placeName ? null : coords(loc.lat, loc.lon));

  return (
    <AdvancedMarker position={{ lat: loc.lat, lng: loc.lon }} zIndex={2000}>
      {/* paddingBottom lifts the card above the person dot; the wrapper's
          bottom-center is anchored to the coordinate. */}
      <div className="pointer-events-auto" style={{ paddingBottom: 30 }}>
        <div className="relative w-72 rounded-xl border border-border bg-panel text-foreground shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b border-border/70 px-3 py-2.5">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-black"
              style={{ backgroundColor: color }}
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {loc.member}
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-panel-2 hover:text-foreground"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-3 py-2.5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <ConfidenceBadge confidence={loc.confidence} />
              {loc.source === "predicted" && (
                <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] text-muted">
                  predicted
                </span>
              )}
              {loc.driving && (
                <span className="inline-flex items-center gap-1 text-[11px] text-accent">
                  ● driving
                </span>
              )}
            </div>

            {placeName && (
              <div className="text-sm font-semibold leading-snug">{placeName}</div>
            )}
            {address && (
              <div
                className={
                  placeName
                    ? "mt-0.5 text-[12px] leading-snug text-muted"
                    : "text-sm font-medium leading-snug"
                }
              >
                {address}
              </div>
            )}

            <div className="mt-2.5 flex items-center gap-2 border-t border-border/60 pt-2 text-[12px] text-muted">
              <span className="tabular-nums">{relativeTime(loc.ts, now)}</span>
              <span className="text-border">·</span>
              <span className="tabular-nums">{clockTime(loc.ts)}</span>
              <span className="ml-auto">
                <Battery level={loc.battery} charging={loc.batteryCharging} />
              </span>
            </div>
          </div>

          {/* Tail pointing down toward the marker */}
          <div className="absolute left-1/2 top-full -translate-x-1/2">
            <div
              className="h-0 w-0 border-x-[8px] border-t-[8px] border-x-transparent"
              style={{ borderTopColor: "var(--border)" }}
            />
            <div
              className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[7px] border-x-transparent"
              style={{ borderTopColor: "var(--panel)" }}
            />
          </div>
        </div>
      </div>
    </AdvancedMarker>
  );
}

/** Fits the map to all visible markers once, then pans to focus on selection. */
function FitBounds({
  locations,
  focus,
}: {
  locations: CurrentLocation[];
  focus: CurrentLocation | null;
}) {
  const map = useMap();
  const fitted = useRef(false);
  // Track the last member we zoomed to so polling updates pan-follow without
  // snapping the zoom back each refresh.
  const lastFocused = useRef<string | null>(null);

  useEffect(() => {
    if (!map || locations.length === 0 || fitted.current) return;
    const bounds = new google.maps.LatLngBounds();
    locations.forEach((l) => bounds.extend({ lat: l.lat, lng: l.lon }));
    map.fitBounds(bounds, 80);
    fitted.current = true;
  }, [map, locations]);

  useEffect(() => {
    if (!map) return;
    if (!focus) {
      lastFocused.current = null;
      return;
    }
    map.panTo({ lat: focus.lat, lng: focus.lon });
    // Only zoom in when a new person is selected, not on every poll refresh.
    if (lastFocused.current !== focus.member) {
      map.setZoom(17);
      lastFocused.current = focus.member;
    }
  }, [map, focus]);

  return null;
}

/** Draws translucent circles for saved geofences (blue); the one being added
 *  or edited is drawn in amber and tracks its live center/radius. */
function GeofenceCircles({
  geofences,
  draft,
  editing,
}: {
  geofences: Geofence[];
  draft: { lat: number; lon: number; radiusM: number } | null;
  editing: (Geofence & { index: number }) | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const circles = geofences
      .map((g, i) =>
        editing?.index === i
          ? null // drawn as the amber editing circle below
          : new google.maps.Circle({
              map,
              center: { lat: g.lat, lng: g.lon },
              radius: g.radiusM,
              strokeColor: "#5b9dff",
              strokeOpacity: 0.7,
              strokeWeight: 1.5,
              fillColor: "#5b9dff",
              fillOpacity: 0.12,
              clickable: false,
            }),
      )
      .filter((c): c is google.maps.Circle => c !== null);

    const amber = draft
      ? { lat: draft.lat, lon: draft.lon, radiusM: draft.radiusM }
      : editing
        ? { lat: editing.lat, lon: editing.lon, radiusM: editing.radiusM }
        : null;
    if (amber) {
      circles.push(
        new google.maps.Circle({
          map,
          center: { lat: amber.lat, lng: amber.lon },
          radius: amber.radiusM,
          strokeColor: "#fbbf24",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#fbbf24",
          fillOpacity: 0.14,
          clickable: false,
        }),
      );
    }
    return () => circles.forEach((c) => c.setMap(null));
  }, [map, geofences, draft, editing]);
  return null;
}

/** Zooms the map to fill the screen with a geofence when one is selected. */
function FocusCircle({ target }: { target: Geofence | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    const bounds = new google.maps.Circle({
      center: { lat: target.lat, lng: target.lon },
      radius: target.radiusM,
    }).getBounds();
    if (bounds) map.fitBounds(bounds, 40);
  }, [map, target]);
  return null;
}

/** Popup form for naming a new geofence at the clicked spot. */
function GeofenceForm({
  draft,
  onRadiusChange,
  onSave,
  onCancel,
}: {
  draft: { lat: number; lon: number; radiusM: number };
  onRadiusChange: (radiusM: number) => void;
  onSave: (g: Geofence) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const radius = draft.radiusM;
  const submit = () => {
    if (name.trim())
      onSave({ name: name.trim(), lat: draft.lat, lon: draft.lon, radiusM: radius });
  };
  return (
    <AdvancedMarker
      position={{ lat: draft.lat, lng: draft.lon }}
      zIndex={3000}
    >
      {/* Keep map gestures from firing when interacting with the form
          (e.g. dragging the radius slider must not pan the map). */}
      <div
        className="pointer-events-auto"
        style={{ paddingBottom: 30 }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="w-64 rounded-xl border border-border bg-panel p-3 text-foreground shadow-2xl">
          <div className="mb-2 text-sm font-semibold">New place</div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Name (e.g. Home, Work)"
            className="mb-2.5 w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <label className="mb-1 flex items-center justify-between text-[12px] text-muted">
            Radius
            <span className="tabular-nums text-foreground">{radius} m</span>
          </label>
          <input
            type="range"
            min={50}
            max={400}
            step={10}
            value={radius}
            aria-label="Geofence radius in meters"
            onChange={(e) => onRadiusChange(Number(e.target.value))}
            className="mb-3 w-full accent-[var(--accent)]"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!name.trim()}
              className="flex-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
            >
              Save place
            </button>
            <button
              onClick={onCancel}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </AdvancedMarker>
  );
}
