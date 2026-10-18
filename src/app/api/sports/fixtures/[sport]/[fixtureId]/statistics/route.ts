import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { error: "The external sports statistics endpoint is disabled." },
    { status: 410 }
  );
}
