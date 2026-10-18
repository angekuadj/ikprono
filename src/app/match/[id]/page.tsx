import Link from "next/link";
import { notFound } from "next/navigation";
import { loadFotMobDetails } from "@/lib/fotmob";
import MatchStatisticsClient from "./MatchStatisticsClient";
import FavoriteFixtureButton from "@/components/FavoriteFixtureButton";
import LiveMatchHeader from "@/components/LiveMatchHeader";

export const dynamic = "force-dynamic";

export default async function MatchDetailsPage({ params }: { params: { id: string } }) {
  if (!/^\d{1,20}$/.test(params.id)) notFound();
  const { fixture } = await loadFotMobDetails(params.id);
  if (!fixture.date) notFound();

  const matchDate = new Date(`${fixture.date}T12:00:00.000Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/predictions" className="text-sm font-medium text-green-400 hover:text-green-300">
          ← Retour aux rencontres
        </Link>

        {/* Match Header — mises à jour automatiques du score, du statut et des cartons */}
        <LiveMatchHeader fixture={fixture} matchDate={matchDate} />
        <div className="mt-6 flex justify-center">
          <FavoriteFixtureButton fixture={fixture} />
        </div>

        {/* Match Statistics */}
        <MatchStatisticsClient fixtureId={params.id} />
      </div>
    </main>
  );
}
