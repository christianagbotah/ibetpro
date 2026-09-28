export type PredictionSource =
  | "heuristic-baseline-v1"
  | "poisson-baseline-v1"
  | "ml-service";

export interface TeamFeatureSnapshot {
  teamName: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  eloRating?: number | null;
  xgFor?: number | null;
  xgAgainst?: number | null;
  shotsPerGame?: number | null;
  shotsOnTargetPerGame?: number | null;
  possessionAvg?: number | null;
  cornersPerGame?: number | null;
  cardsPerGame?: number | null;
  form?: string | null;
}

export interface ModelFeatureVector {
  home_elo: number;
  away_elo: number;
  elo_diff: number;
  home_form_points_5: number;
  away_form_points_5: number;
  home_goals_for_5: number;
  away_goals_for_5: number;
  home_goals_against_5: number;
  away_goals_against_5: number;
  home_xg_for_5?: number | null;
  away_xg_for_5?: number | null;
  home_xg_against_5?: number | null;
  away_xg_against_5?: number | null;
  home_shots_5?: number | null;
  away_shots_5?: number | null;
  home_sot_5?: number | null;
  away_sot_5?: number | null;
  home_rest_days?: number | null;
  away_rest_days?: number | null;
  home_implied_prob?: number | null;
  draw_implied_prob?: number | null;
  away_implied_prob?: number | null;
  home_market_prob?: number | null;
  draw_market_prob?: number | null;
  away_market_prob?: number | null;
  market_consensus_available?: boolean | null;
  market_overround?: number | null;
  market_entropy?: number | null;
  market_home_away_log_ratio?: number | null;
  market_home_draw_log_ratio?: number | null;
  market_away_draw_log_ratio?: number | null;
  home_possession_5?: number | null;
  away_possession_5?: number | null;
  home_corners_5?: number | null;
  away_corners_5?: number | null;
  home_yellow_cards_5?: number | null;
  away_yellow_cards_5?: number | null;
  home_red_cards_5?: number | null;
  away_red_cards_5?: number | null;
  home_home_form_points_5?: number | null;
  away_away_form_points_5?: number | null;
  home_home_goals_for_5?: number | null;
  home_home_goals_against_5?: number | null;
  away_away_goals_for_5?: number | null;
  away_away_goals_against_5?: number | null;
  home_home_shots_5?: number | null;
  away_away_shots_5?: number | null;
  home_home_sot_5?: number | null;
  away_away_sot_5?: number | null;
  home_home_corners_5?: number | null;
  away_away_corners_5?: number | null;
  home_home_yellow_cards_5?: number | null;
  away_away_yellow_cards_5?: number | null;
}

export interface PredictionInput {
  matchId: string;
  asOf: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  minute?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  homeOdds?: number | null;
  drawOdds?: number | null;
  awayOdds?: number | null;
  overUnderLine?: number | null;
  home: TeamFeatureSnapshot | null;
  away: TeamFeatureSnapshot | null;
  modelFeatures?: ModelFeatureVector | null;
}

export interface ScoreProbability {
  home: number;
  away: number;
  probability: number;
}

export interface ProbabilityMarket {
  key: string;
  label: string;
  probability: number;
  fairOdds: number | null;
}

export interface MatchPrediction {
  resultMode: "baseline" | "market-consensus" | "selective-model";
  schemaVersion: "1.0";
  modelVersion: string;
  source: PredictionSource;
  generatedAt: string;
  asOf: string;
  matchId: string;
  expectedGoals: {
    home: number;
    away: number;
    total: number;
  };
  result: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  scorelines: ScoreProbability[];
  markets: ProbabilityMarket[];
  confidence: number;
  dataCompleteness: number;
  warnings: string[];
}

export function fairOdds(probability: number): number | null {
  return probability > 0 && probability <= 1
    ? Math.round((1 / probability) * 100) / 100
    : null;
}
