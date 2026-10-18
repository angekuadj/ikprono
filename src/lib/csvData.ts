import type { Fixture } from "@/lib/fixtures";
import { promises as fs } from "fs";
import path from "path";

const CSV_PATH = "/home/angek/Documents/base/matchendirect_15_10_2026.csv";

interface CsvRow {
  date: string;
  competition: string;
  match_id: string;
  home_team: string;
  away_team: string;
  home_score: string;
  away_score: string;
  score: string;
  time: string;
  status: string;
}

function parseCsvLine(line: string): CsvRow | null {
  const parts = line.split(",");
  if (parts.length < 10) return null;

  const [date, competition, matchId, homeTeam, awayTeam, homeScore, awayScore, score, time, status] = parts;
  if (!date || !competition || !homeTeam || !awayTeam) return null;

  return {
    date: date.trim(),
    competition: competition.trim(),
    match_id: matchId.trim(),
    home_team: homeTeam.trim(),
    away_team: awayTeam.trim(),
    home_score: homeScore.trim(),
    away_score: awayScore.trim(),
    score: score.trim(),
    time: time.trim(),
    status: status.trim(),
  };
}

function parseDate(dateStr: string): string {
  // Convert "15-10-2026" to "2026-10-15"
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

function parseTime(timeStr: string): string {
  const trimmed = timeStr.trim();
  // Keep live match times as-is (e.g., "1'", "21'", "76'")
  // Keep special statuses (ANL, PEN, REP, TER) as-is
  // Keep regular times as-is (e.g., "00:00", "03:30", "21:00")
  return trimmed;
}

export async function loadFixturesFromCsv(): Promise<Fixture[]> {
  try {
    const content = await fs.readFile(CSV_PATH, "utf-8");
    const lines = content.split("\n").filter(line => line.trim());

    // Skip header row
    const dataLines = lines.slice(1);

    const fixtures: Fixture[] = [];
    let index = 0;

    for (const line of dataLines) {
      const row = parseCsvLine(line);
      if (!row) continue;

      const isoDate = parseDate(row.date);
      fixtures.push({
        id: row.match_id || `csv-${index++}`,
        sport: "football",
        date: isoDate,
        time: parseTime(row.time),
        league: row.competition,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        matchId: row.match_id || undefined,
        homeScore: row.home_score || undefined,
        awayScore: row.away_score || undefined,
        score: row.score || undefined,
        status: row.status || undefined,
      });
    }

    return fixtures;
  } catch (error) {
    console.error("Error loading CSV:", error);
    return [];
  }
}

export async function loadFixturesFromCsvByDateRange(from: string, to: string): Promise<Fixture[]> {
  const allFixtures = await loadFixturesFromCsv();
  return allFixtures.filter(fixture => fixture.date >= from && fixture.date <= to);
}
