import type { CurrentLocation, Geofence, MemberInfo } from "@/lib/types";
import { memberColor } from "@/lib/colors";
import { coords, relativeTime } from "@/lib/format";
import { Battery, ConfidenceBadge } from "./ui";

export default function Sidebar({
  locations,
  members,
  hidden,
  selected,
  now,
  error,
  geofences,
  placing,
  onToggle,
  onSelect,
  onAddPlace,
  onDeletePlace,
}: {
  locations: CurrentLocation[];
  members: MemberInfo[];
  hidden: Set<string>;
  selected: string | null;
  now: number;
  error: string | null;
  geofences: Geofence[];
  placing: boolean;
  onToggle: (member: string) => void;
  onSelect: (member: string) => void;
  onAddPlace: () => void;
  onDeletePlace: (index: number) => void;
}) {
  const byMember = new Map(locations.map((l) => [l.member, l]));
  // Show every known member, even if a current fix is missing.
  const names =
    members.length > 0 ? members.map((m) => m.member) : [...byMember.keys()];

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          People · {names.length}
        </span>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
      {error && (
        <div className="mx-3 mb-2 rounded-md bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {error}
        </div>
      )}

      {names.length === 0 && !error && (
        <ul className="flex flex-col gap-1 px-2 pb-4" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center gap-2.5 px-2 py-2">
              <span className="skeleton h-7 w-7 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1">
                <span className="skeleton block h-3 w-24 rounded" />
                <span className="skeleton mt-1.5 block h-2.5 w-32 rounded" />
              </span>
            </li>
          ))}
        </ul>
      )}

      <ul className="flex flex-col gap-1 px-2 pb-4">
        {names.map((name) => {
          const loc = byMember.get(name);
          const color = memberColor(name);
          const isHidden = hidden.has(name);
          const isSel = selected === name;
          const place =
            loc?.place?.name ||
            loc?.place?.address ||
            (loc ? coords(loc.lat, loc.lon) : "no recent fix");
          return (
            <li key={name}>
              <div
                className={`group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors ${
                  isSel ? "bg-panel-2" : "hover:bg-panel-2/60"
                }`}
              >
                <button
                  onClick={() => onToggle(name)}
                  title={isHidden ? "Show on map" : "Hide from map"}
                  aria-label={`${isHidden ? "Show" : "Hide"} ${name} on map`}
                  aria-pressed={!isHidden}
                  className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-black"
                  style={{
                    backgroundColor: color,
                    opacity: isHidden ? 0.25 : 1,
                  }}
                >
                  {name
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </button>

                <button
                  onClick={() => loc && onSelect(name)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{name}</span>
                    {loc && <ConfidenceBadge confidence={loc.confidence} />}
                  </div>
                  <div className="truncate text-[12px] text-muted">{place}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    {loc ? (
                      <>
                        <span>{relativeTime(loc.ts, now)}</span>
                        {loc.stale && (
                          <span className="text-guessed">· stale</span>
                        )}
                        <Battery
                          level={loc.battery}
                          charging={loc.batteryCharging}
                        />
                      </>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      </div>

      {/* Named places (geofences) — pinned footer so "+ Add" is always visible */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Places · {geofences.length}
          </span>
          <button
            onClick={onAddPlace}
            className={`rounded-md border px-2 py-1 text-[12px] ${
              placing
                ? "border-accent text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {placing ? "Tap map…" : "+ Add"}
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {geofences.map((g, i) => (
            <li
              key={`${g.name}-${i}`}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-panel-2/60"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
                  <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{g.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted">
                {g.radiusM}m
              </span>
              <button
                onClick={() => onDeletePlace(i)}
                aria-label={`Delete ${g.name}`}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted opacity-0 hover:text-red-300 group-hover:opacity-100"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
          {geofences.length === 0 && (
            <li className="px-2 text-[12px] leading-relaxed text-muted">
              No saved places. Tap <span className="text-foreground">+ Add</span>,
              then tap the map to name a spot (e.g. Home, Work) — it overrides
              Google&apos;s guess.
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}
