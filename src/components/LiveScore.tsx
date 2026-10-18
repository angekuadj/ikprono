"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

interface Match {
  id: number;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute?: number;
  set?: number;
  status: string;
}

interface LiveScoreProps {
  match: Match;
}

export default function LiveScore({ match }: LiveScoreProps) {
  const [isScoreChanged, setIsScoreChanged] = useState(false);
  const { text } = useLanguage();
  const getSportIcon = (sport: string) => {
    switch (sport.toLowerCase()) {
      case 'football':
        return '⚽';
      case 'basketball':
        return '🏀';
      case 'tennis':
        return '🎾';
      default:
        return '🏆';
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'En cours' || status === 'In progress') return 'bg-red-500';
    if (status === 'Mi-temps' || status === 'Half-time') return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl hover:border-red-600 transition-all duration-300 overflow-hidden border-l-4 border-red-500 card-hover animate-slide-up">
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <span className="text-2xl mr-2 animate-bounce">{getSportIcon(match.sport)}</span>
            <div>
              <p className="font-semibold text-white">{match.league}</p>
              <p className="text-xs text-gray-400">{match.sport}</p>
            </div>
          </div>
          <div className={`${getStatusColor(match.status)} text-white text-xs px-3 py-1 rounded-full animate-pulse`}>
            {match.status === "En cours" ? text("En cours", "In progress") : match.status === "Mi-temps" ? text("Mi-temps", "Half-time") : match.status}
          </div>
        </div>

        {/* Teams and Score */}
        <div className="flex justify-between items-center mb-4">
          <div className="text-center flex-1">
            <p className="font-bold text-white text-lg animate-wave">{match.homeTeam}</p>
          </div>
          <div className="flex items-center space-x-3 mx-4">
            <span className={`text-4xl font-bold text-green-500 ${isScoreChanged ? "animate-zoom-in" : ""}`}>
              {match.homeScore}
            </span>
            <span className="text-2xl text-gray-400">-</span>
            <span className={`text-4xl font-bold text-green-500 ${isScoreChanged ? "animate-zoom-in" : ""}`}>
              {match.awayScore}
            </span>
          </div>
          <div className="text-center flex-1">
            <p className="font-bold text-white text-lg animate-wave" style={{ animationDelay: "0.2s" }}>
              {match.awayTeam}
            </p>
          </div>
        </div>

        {/* Time/Set */}
        {match.minute && (
          <div className="text-center text-gray-400">
            <span className="inline-flex items-center">
              <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
              {match.minute}&apos; {text("minute", "min")}
            </span>
          </div>
        )}
        {match.set && (
          <div className="text-center text-gray-400">
            <span className="inline-flex items-center">
              <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
              Set {match.set}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
