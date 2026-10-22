import { NextResponse } from "next/server";
import { isIsoDate, loadFixturesFromFotMobByDate } from "@/lib/fotmob";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const preferredDate = new URL(request.url).searchParams.get("preferredDate") ?? undefined;
    if (preferredDate && !isIsoDate(preferredDate)) {
      return NextResponse.json({ error: "Provide a valid preferred date in YYYY-MM-DD format." }, { status: 400 });
    }
    let date = preferredDate ?? new Date().toISOString().slice(0, 10);
    try {
      let fixtures = await loadFixturesFromFotMobByDate(date);
      if (preferredDate && fixtures.length === 0) {
        date = new Date().toISOString().slice(0, 10);
        fixtures = await loadFixturesFromFotMobByDate(date);
      }
    } catch (error) {
      // Le service football est indisponible : on conserve la date demandée
      // plutôt que de bloquer l'affichage des rencontres de basket.
      console.error("Could not resolve the latest fixture date from the football service.", error);
    }
    return NextResponse.json({ date });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unable to load the current fixture date.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
