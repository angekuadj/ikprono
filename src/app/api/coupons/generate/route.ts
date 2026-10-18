import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { loadFixturesFromFotMobByIds } from "@/lib/fotmob";
import { generateFotMobCoupons, isRiskLevel } from "@/lib/fotmobCoupons";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (!isRecord(payload)
    || typeof payload.userId !== "string" || payload.userId.length < 1 || payload.userId.length > 128
    || typeof payload.selectionId !== "string" || payload.selectionId.length < 1 || payload.selectionId.length > 128
    || !Array.isArray(payload.fixtureIds) || payload.fixtureIds.length < 1 || payload.fixtureIds.length > 20
    || !payload.fixtureIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 128)) {
    return NextResponse.json(
      { error: "Provide valid user and selection IDs and between 1 and 20 fixture IDs." },
      { status: 400 }
    );
  }

  const fixtureIds = payload.fixtureIds as string[];
  if (new Set(fixtureIds).size !== fixtureIds.length) {
    return NextResponse.json({ error: "Fixture IDs must be unique." }, { status: 400 });
  }
  const riskLevel = payload.riskLevel ?? "medium";
  if (!isRiskLevel(riskLevel)) {
    return NextResponse.json({ error: "Provide a valid risk level." }, { status: 400 });
  }

  try {
    const fixtures = await loadFixturesFromFotMobByIds(fixtureIds);
    if (fixtures.length !== fixtureIds.length) {
      return NextResponse.json({ error: "One or more fixtures were not found." }, { status: 404 });
    }
    const coupons = await generateFotMobCoupons(fixtures, riskLevel, 3);
    const scriptPath = path.join(process.cwd(), "scripts", "generate_coupons.py");
    const storePath = path.join(process.cwd(), ".coupon-data", "generations.sqlite");
    const { stdout } = await execFileAsync(
      process.env.PYTHON_EXECUTABLE || "python3",
      [
        scriptPath,
        JSON.stringify({
          userId: payload.userId,
          selectionId: payload.selectionId,
          fixtureIds,
          coupons,
        }),
      ],
      {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          IKPRONO_COUPON_STORE_DB: process.env.IKPRONO_COUPON_STORE_DB || storePath,
        },
      }
    );
    const result = JSON.parse(stdout) as { coupons?: unknown; alreadyGenerated?: boolean };
    if (!Array.isArray(result.coupons) || typeof result.alreadyGenerated !== "boolean") {
      throw new Error("Coupon persistence service returned an invalid response.");
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Coupon generation failed.", error);
    const message = error instanceof Error ? error.message : "Unable to generate coupons.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
