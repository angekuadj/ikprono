"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

const lotteries = [
  {
    id: 1,
    name: "Jackpot Hebdomadaire",
    prize: "10 000 FCFA",
    icon: "💰",
    participants: 1250,
    drawDate: "2026-10-20",
    tickets: 5000,
    type: "weekly",
  },
  {
    id: 2,
    name: "iPhone 15 Pro",
    prize: "iPhone 15 Pro",
    icon: "🏆",
    participants: 850,
    drawDate: "2026-10-31",
    tickets: 3000,
    type: "monthly",
  },
  {
    id: 3,
    name: "Abonnement Gratuit",
    prize: "1 an Premium",
    icon: "🎁",
    participants: 4200,
    drawDate: "2026-10-18",
    tickets: 10000,
    type: "daily",
  },
];

const numberFormatter = new Intl.NumberFormat("fr-FR");
const slotSymbols = ["🍒", "🍋", "🍊", "💎", "7️⃣"];

export default function LotteryPage() {
  const { language, text } = useLanguage();
  const [selectedLottery, setSelectedLottery] = useState<number | null>(null);
  const [tickets, setTickets] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reelSymbols, setReelSymbols] = useState(slotSymbols);
  const [winner, setWinner] = useState<string | null>(null);

  useEffect(() => {
    if (!spinning) return;

    const spinInterval = window.setInterval(() => {
      setReelSymbols(slotSymbols.map(() => slotSymbols[Math.floor(Math.random() * slotSymbols.length)]));
    }, 90);
    const spinTimeout = window.setTimeout(() => {
      const finalSymbols = slotSymbols.map(() => slotSymbols[Math.floor(Math.random() * slotSymbols.length)]);
      setReelSymbols(finalSymbols);
      setWinner(`${finalSymbols.join(" ")} · ${text("Tour de démonstration terminé", "Demo spin complete")}`);
      setSpinning(false);
      setTickets(currentTickets => Math.max(0, currentTickets - 1));
    }, 1800);

    return () => {
      window.clearInterval(spinInterval);
      window.clearTimeout(spinTimeout);
    };
  }, [spinning, text]);

  const handleBuyTicket = () => {
    if (selectedLottery !== null) {
      setTickets(currentTickets => currentTickets + 1);
      setWinner(null);
    }
  };

  const handleSpin = () => {
    if (tickets > 0 && !spinning) {
      setSpinning(true);
      setWinner(null);
    }
  };

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${date}T12:00:00`));

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-white sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="relative mb-10 overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-950/50 via-gray-950 to-gray-950 px-6 py-10 shadow-2xl shadow-fuchsia-950/20 sm:px-10 sm:py-14">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-200">
              <span aria-hidden="true">🎟️</span>
              {text("Mode démonstration", "Demo mode")}
            </span>
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-5xl">
              {text("Simulateur de tirage", "Draw simulator")}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300 sm:text-lg">
              {text(
                "Cette page est une démonstration locale : les lots, dates et statistiques sont fictifs. Aucun paiement, ticket réel ou gain n’est proposé.",
                "This is a local demonstration: prizes, dates, and statistics are fictional. No payment, real ticket, or prize is offered."
              )}
            </p>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">
              {text("Exemples de tirages fictifs", "Fictional draw examples")}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {text("Sélectionnez un exemple pour tester le simulateur.", "Select an example to try the simulator.")}
            </p>
          </div>
          <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs font-medium text-gray-300">
            {text("Simulation gratuite", "Free simulation")}
          </span>
        </div>

        <section aria-label={text("Tirages disponibles", "Available draws")} className="mb-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {lotteries.map(lottery => {
            const selected = selectedLottery === lottery.id;
            const drawType = lottery.type === "weekly"
              ? text("Tirage hebdomadaire", "Weekly draw")
              : lottery.type === "monthly"
                ? text("Tirage mensuel", "Monthly draw")
                : text("Tirage quotidien", "Daily draw");

            return (
              <article
                key={lottery.id}
                className={`group flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-gray-900 to-gray-950 transition duration-200 ${
                  selected
                    ? "border-fuchsia-400/70 shadow-lg shadow-fuchsia-950/30"
                    : "border-gray-800 hover:-translate-y-1 hover:border-gray-600"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedLottery(lottery.id)}
                  className="flex flex-1 flex-col p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400 sm:p-6"
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl border border-fuchsia-300/15 bg-fuchsia-400/10 text-2xl" aria-hidden="true">
                      {lottery.icon}
                    </span>
                    <span className="rounded-full border border-gray-700 px-3 py-1 text-xs font-medium text-gray-300">
                      {drawType}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-white">
                    {text(
                      lottery.name,
                      lottery.type === "weekly"
                        ? "Weekly Jackpot"
                        : lottery.type === "monthly"
                          ? "iPhone 15 Pro"
                          : "Free subscription"
                    )}
                  </h3>
                  <p className="mt-2 text-2xl font-extrabold tracking-tight text-fuchsia-300 sm:text-3xl">
                    {lottery.prize}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-300">
                    {text("Voir le tirage", "View draw")}
                    <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span>
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-3 border-t border-gray-800 px-5 py-4 text-sm sm:px-6">
                  <div>
                    <p className="text-xs text-gray-500">{text("Date fictive", "Fictional date")}</p>
                    <p className="mt-1 font-semibold text-gray-200">{formatDate(lottery.drawDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{text("Exemple de participants", "Sample participants")}</p>
                    <p className="mt-1 font-semibold text-gray-200">{numberFormatter.format(lottery.participants)}</p>
                  </div>
                  <div className="col-span-2">
                    <div className="mb-1.5 flex justify-between text-xs text-gray-500">
                      <span>{text("Tickets fictifs", "Fictional tickets")}</span>
                      <span>{numberFormatter.format(lottery.tickets)}</span>
                    </div>
                  </div>
                </div>

                {selected && (
                  <div className="px-5 pb-5 sm:px-6">
                    <button
                      type="button"
                      onClick={handleBuyTicket}
                      className="w-full rounded-xl bg-fuchsia-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300 focus:ring-offset-2 focus:ring-offset-gray-950"
                    >
                      {text("Ajouter un ticket démo", "Add demo ticket")}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <section className="mx-auto mb-8 max-w-3xl overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-950/40 via-gray-900 to-gray-950 shadow-xl shadow-violet-950/10">
          <div className="border-b border-white/5 px-5 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-400/10 text-2xl" aria-hidden="true">🎰</span>
              <div>
                <h2 className="text-lg font-bold sm:text-xl">{text("Machine de démonstration", "Demo slot machine")}</h2>
                <p className="mt-1 text-sm text-gray-400">{text("Essayez la machine avec vos tickets démo.", "Try the machine with your demo tickets.")}</p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8">
            <div className="rounded-2xl border border-gray-800 bg-black/40 p-4 sm:p-6">
              <div className="flex justify-center gap-2 sm:gap-4" aria-label={text("Machine à sous", "Slot machine")}>
                {reelSymbols.map((emoji, index) => (
                  <div
                    key={index}
                    className={`grid h-12 w-12 place-items-center rounded-xl border bg-gray-900 text-2xl transition sm:h-16 sm:w-16 sm:text-4xl ${
                      spinning ? "animate-bounce border-violet-400" : "border-gray-800"
                    }`}
                    style={spinning ? { animationDelay: `${index * 80}ms` } : undefined}
                    aria-hidden="true"
                  >
                    {emoji}
                  </div>
                ))}
              </div>
              {winner && (
                <p role="status" className="mt-5 text-center text-sm font-semibold text-violet-200">
                  {winner}
                  <span className="mt-1 block font-normal text-gray-400">
                    {text("Aucun gain réel : il s’agit d’une démonstration.", "No real prize: this is a demonstration only.")}
                  </span>
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{text("Vos tickets démo", "Your demo tickets")}</p>
                <p className="mt-1 text-2xl font-extrabold text-violet-300">{numberFormatter.format(tickets)}</p>
              </div>
              <button
                type="button"
                onClick={handleSpin}
                disabled={spinning || tickets === 0}
                className="rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
              >
                {spinning
                  ? text("La machine tourne…", "Spinning…")
                  : tickets === 0
                    ? text("Sélectionnez un tirage", "Select a draw")
                    : text("Jouer · 1 ticket", "Play · 1 ticket")}
              </button>
            </div>
          </div>
        </section>

        <aside className="mx-auto max-w-3xl rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-5 sm:p-6">
          <h2 className="font-bold text-amber-100">{text("À savoir", "Please note")}</h2>
          <p className="mt-2 text-sm leading-6 text-gray-300">
            {text(
              "Démo uniquement : aucun paiement, ticket ou tirage réel. Les données affichées sont fictives et restent locales à cette session.",
              "Demo only: no real payment, ticket, or draw. Displayed data is fictional and stays local to this session."
            )}
          </p>
        </aside>

        <div className="mt-8 text-center">
          <Link
            href="/payment"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-400 transition hover:text-white"
          >
            <span aria-hidden="true">←</span>
            {text("Retour aux abonnements", "Back to subscriptions")}
          </Link>
        </div>
      </div>
    </div>
  );
}
