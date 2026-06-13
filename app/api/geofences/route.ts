import { NextRequest, NextResponse } from "next/server";
import { loadGeofences, saveGeofences } from "@/lib/geofences";
import type { Geofence } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ geofences: loadGeofences() });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Geofence>;
    const name = body.name?.trim();
    const { lat, lon } = body;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        { error: "name, lat, and lon are required" },
        { status: 400 },
      );
    }
    const radiusM = Number.isFinite(body.radiusM) ? Number(body.radiusM) : 130;
    const fences = loadGeofences();
    fences.push({ name, lat: lat!, lon: lon!, radiusM, address: body.address ?? null });
    saveGeofences(fences);
    return NextResponse.json({ ok: true, geofences: fences });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export function DELETE(req: NextRequest) {
  const index = req.nextUrl.searchParams.get("index");
  if (index == null || Number.isNaN(Number(index))) {
    return NextResponse.json({ error: "index is required" }, { status: 400 });
  }
  const fences = loadGeofences().filter((_, i) => i !== Number(index));
  saveGeofences(fences);
  return NextResponse.json({ ok: true, geofences: fences });
}
