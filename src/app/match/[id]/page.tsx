import Link from "next/link";
import { notFound } from "next/navigation";
import { loadFotMobDetails } from "@/lib/fotmob";
import MatchStatisticsClient from "./MatchStatisticsClient";
import FavoriteFixtureButton from "@/components/FavoriteFixtureButton";
import LiveMatchHeader from "@/components/LiveMatchHeader";
import MatchPushAlerts from "@/components/MatchPushAlerts";

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
    <div className="match-center min-h-screen bg-black px-4 py-7 text-white sm:px-6 lg:px-8">
      <div className="match-center-content mx-auto max-w-6xl">
        <nav className="match-breadcrumbs" aria-label="Fil d’Ariane">
          <Link href="/predictions" className="match-back-link">
            ← Retour aux rencontres
          </Link>
          <span aria-hidden="true">/</span>
          <span>Fiche du match</span>
        </nav>

        <LiveMatchHeader fixture={fixture} matchDate={matchDate} />
        <div className="match-actions">
          <FavoriteFixtureButton fixture={fixture} />
        </div>

        <MatchPushAlerts fixture={fixture} />
        <MatchStatisticsClient fixtureId={params.id} />
      </div>
    </div>
  );
}
