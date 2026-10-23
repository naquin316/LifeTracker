import { NextRequest, NextResponse } from "next/server";
import { loadGeofences, parseFenceIndex, saveGeofences } from "@/lib/geofences";
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

export async function PUT(req: NextRequest) {
  try {
    const index = req.nextUrl.searchParams.get("index");
    if (index == null || !/^\d+$/.test(index)) {
      return NextResponse.json({ error: "index is required" }, { status: 400 });
    }
    const body = (await req.json()) as Partial<Geofence>;
    const name = body.name?.trim();
    const { lat, lon } = body;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        { error: "name, lat, and lon are required" },
        { status: 400 },
      );
    }
    const fences = loadGeofences();
    const i = parseFenceIndex(index, fences.length);
    if (i == null) {
      return NextResponse.json({ error: "index out of range" }, { status: 404 });
    }
    const radiusM = Number.isFinite(body.radiusM) ? Number(body.radiusM) : fences[i].radiusM;
    fences[i] = { name, lat: lat!, lon: lon!, radiusM, address: body.address ?? null };
    saveGeofences(fences);
    return NextResponse.json({ ok: true, geofences: fences });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export function DELETE(req: NextRequest) {
  const index = req.nextUrl.searchParams.get("index");
  if (index == null || !/^\d+$/.test(index)) {
    return NextResponse.json({ error: "index is required" }, { status: 400 });
  }
  const i = parseFenceIndex(index, loadGeofences().length);
  if (i == null) {
    return NextResponse.json({ error: "index out of range" }, { status: 404 });
  }
  const fences = loadGeofences().filter((_, n) => n !== i);
  saveGeofences(fences);
  return NextResponse.json({ ok: true, geofences: fences });
}
