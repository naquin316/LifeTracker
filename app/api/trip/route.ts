import { NextRequest, NextResponse } from "next/server";
import { getPointsInRange } from "@/lib/db";
import { detectStaysAndMoves } from "@/lib/stays";
import { resolvePlace } from "@/lib/places";
import { reconstructRoute } from "@/lib/routes";
import type { Trip } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Parse a unix-seconds number or an ISO date string into unix seconds. */
function parseTs(v: string | null): number | null {
  if (!v) return null;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/**
 * Reconstruct a member's trip over a time window: stays (named via Google) and
 * the road-snapped moves between them.
 * GET /api/trip?member=...&from=...&to=...
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const member = sp.get("member");
    const from = parseTs(sp.get("from"));
    const to = parseTs(sp.get("to"));

    if (!member || from == null || to == null) {
      return NextResponse.json(
        { error: "member, from, and to are required" },
        { status: 400 },
      );
    }

    const points = getPointsInRange(member, from, to);
    const { stays, moves } = detectStaysAndMoves(points);

    // Name each stay (best-guess venue) and snap each move to roads, in parallel.
    const [namedStays, snappedMoves] = await Promise.all([
      Promise.all(
        stays.map(async (s) => ({
          ...s,
          place: await resolvePlace({
            lat: s.lat,
            lon: s.lon,
            accuracy: null,
            source: "gps_fix",
          }),
        })),
      ),
      Promise.all(moves.map((m) => reconstructRoute(m))),
    ]);

    const trip: Trip = {
      member,
      fromTs: from,
      toTs: to,
      stays: namedStays,
      moves: snappedMoves,
    };
    return NextResponse.json(trip);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
