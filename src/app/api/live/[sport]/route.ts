import { NextRequest, NextResponse } from "next/server";

const SPORTS_AUTORISES = ["football", "basketball", "cricket", "tennis"] as const;

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { sport: string } }
) {
  const { sport } = params;

  if (!SPORTS_AUTORISES.includes(sport as any)) {
    return NextResponse.json(
      {
        success: false,
        error: "Sport non pris en charge"
      },
      { status: 400 }
    );
  }

  const sportsWithFixturesRoute = ["football", "basketball"] as const;

  // Pour le football et le basket, on utilise la route dédiée /api/sports/fixtures/live afin de
  // conserver le cache PostgreSQL et d'éviter les échecs réseau côté serveur.
  if (sportsWithFixturesRoute.includes(sport as (typeof sportsWithFixturesRoute)[number])) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const response = await fetch(`${baseUrl}/api/sports/fixtures/live?sport=${sport}`, {
        cache: "no-store",
        headers: {
          "Accept": "application/json",
        },
      });
      const payload = await response.json() as {
        fixtures?: any[];
        error?: string;
        warning?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Impossible de récupérer les matchs en direct");
      }
      const fixtures = Array.isArray(payload.fixtures) ? payload.fixtures : [];
      return NextResponse.json({
        success: true,
        sport,
        count: fixtures.length,
        matches: fixtures,
      });
    } catch (error) {
      console.error(`Erreur lors de la récupération des matchs live pour ${sport}:`, error);
      return NextResponse.json(
        {
          success: false,
          message: "Impossible de récupérer les matchs en direct"
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    {
      success: false,
      message: "Sport non pris en charge pour les matchs en direct"
    },
    { status: 404 }
  );
}

