export interface MobileMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  status: string;
  commenceTime: string;
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  aiHomeWinProb: number | null;
  aiDrawProb: number | null;
  aiAwayWinProb: number | null;
  aiConfidence: number | null;
}

export interface RichPrediction {
  modelVersion: string;
  source: string;
  expectedGoals: { home: number; away: number; total: number };
  result: { homeWin: number; draw: number; awayWin: number };
  scorelines: Array<{ home: number; away: number; probability: number }>;
  markets: Array<{ key: string; label: string; probability: number; fairOdds: number | null }>;
  confidence: number;
  dataCompleteness: number;
  warnings: string[];
}

const API_BASE_URL =
  process.env.EXPO_PUBLIC_IBETPRO_API_URL || "https://ibetpro.lightworldtech.com";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`iBetPro API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getMatches(): Promise<MobileMatch[]> {
  return request<MobileMatch[]>("/api/matches");
}

export async function getPrediction(matchId: string): Promise<RichPrediction> {
  const result = await request<{ prediction: RichPrediction }>(
    `/api/predictions/${encodeURIComponent(matchId)}`
  );
  return result.prediction;
}
