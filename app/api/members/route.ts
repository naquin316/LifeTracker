import { NextResponse } from "next/server";
import { listMembers } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return NextResponse.json({ members: listMembers() });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
