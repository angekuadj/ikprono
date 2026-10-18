import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { error: "Use /api/sports/fixtures for real football, basketball, and tennis fixtures." },
    { status: 410 }
  );
}
