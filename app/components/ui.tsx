import type { Confidence } from "@/lib/types";

/** "real" (green) vs "guessed" (amber) chip. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const real = confidence === "real";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        real ? "bg-real/15 text-real" : "bg-guessed/15 text-guessed"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${real ? "bg-real" : "bg-guessed"}`}
      />
      {real ? "real" : "guessed"}
    </span>
  );
}

/** Compact battery indicator. */
export function Battery({
  level,
  charging,
}: {
  level: number | null;
  charging: boolean | null;
}) {
  if (level == null) return null;
  const color =
    level <= 15 ? "text-red-400" : level <= 35 ? "text-guessed" : "text-muted";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${color}`}>
      <svg viewBox="0 0 24 14" width="20" height="12" fill="none">
        <rect
          x="1"
          y="1"
          width="19"
          height="12"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <rect x="21" y="4.5" width="2" height="5" rx="1" fill="currentColor" />
        <rect
          x="2.5"
          y="2.5"
          width={Math.max(1, (16 * level) / 100)}
          height="9"
          rx="1.2"
          fill="currentColor"
        />
      </svg>
      {Math.round(level)}%{charging ? "⚡" : ""}
    </span>
  );
}
