import { NextResponse } from "next/server";
import { buildCurrent } from "@/lib/current";
import { resolvePlace } from "@/lib/places";
import { predictIfStale } from "@/lib/predict";

export const dynamic = "force-dynamic";

/**
 * Current best-known position for every member.
 * - Fresh fixes: the recorded GPS point, place-named via Google ("real").
 * - Stale fixes: a predicted position from history ("guessed"/predicted).
 */
export async function GET() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const base = buildCurrent(now);

    const enriched = await Promise.all(
      base.map(async (loc) => {
        // If the latest fix is stale, try to predict where they are now.
        const predicted = loc.stale ? predictIfStale(loc.member, now) : null;
        const target = predicted ?? loc;

        const place = await resolvePlace({
          lat: target.lat,
          lon: target.lon,
          accuracy: null,
          source: target.source,
        });
        return { ...target, place };
      }),
    );

    return NextResponse.json({ now, locations: enriched });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
