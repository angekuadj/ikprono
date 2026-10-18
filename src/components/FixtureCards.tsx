"use client";

import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import type { FixtureCards as FixtureCardsData } from "@/lib/fixtures";

export default function FixtureCards({
  cards,
  homeTeam,
  awayTeam,
  homeImageUrl,
  awayImageUrl,
}: {
  cards: FixtureCardsData | undefined;
  homeTeam: string;
  awayTeam: string;
  homeImageUrl?: string;
  awayImageUrl?: string;
}) {
  const { text } = useLanguage();
  if (!cards && !homeImageUrl && !awayImageUrl) return null;

  return (
    <div
      className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-gray-300"
      aria-label={cards ? text("Cartons du match", "Match cards") : text("Équipes du match", "Match teams")}
    >
      {[
        { name: homeTeam, imageUrl: homeImageUrl, side: cards?.home },
        { name: awayTeam, imageUrl: awayImageUrl, side: cards?.away },
      ].map(({ name, imageUrl, side }) => (
        <div key={name} className="min-w-0 rounded-md bg-gray-800/70 px-2 py-1.5">
          <p className="flex items-center gap-1.5 truncate font-medium text-gray-400">
            {imageUrl && <Image src={imageUrl} alt="" width={16} height={16} unoptimized className="h-4 w-4 shrink-0 object-contain" />}
            <span className="truncate">{name}</span>
          </p>
          {side && (
            <div className="mt-1 flex items-center gap-3">
              <span title={text("Cartons jaunes", "Yellow cards")}>
                <span aria-hidden className="mr-1 inline-block h-3 w-2 rounded-[2px] bg-yellow-400 align-[-2px]" />
                {side.yellow}
              </span>
              <span
                title={text("Cartons rouges", "Red cards")}
                aria-label={`${text("Cartons rouges", "Red cards")}: ${side.red}`}
                className={side.red > 0 ? "inline-flex items-center gap-1 rounded bg-red-950 px-1.5 py-0.5 font-bold text-red-200" : ""}
              >
                <span aria-hidden className="inline-block h-3 w-2 rounded-[2px] bg-red-500 align-[-2px]" />
                {side.red}
              </span>
              <span aria-label={`${text("Corners", "Corners")}: ${side.corners}`} title={text("Corners", "Corners")}>
                <span aria-hidden className="mr-1 text-green-400">⚑</span>
                {side.corners}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}