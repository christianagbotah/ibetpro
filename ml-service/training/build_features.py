from __future__ import annotations

from collections import defaultdict, deque
from pathlib import Path

import numpy as np
import pandas as pd

REQUIRED_RAW_COLUMNS = [
    "fixture_id",
    "kickoff_utc",
    "league",
    "season",
    "home_team_id",
    "away_team_id",
    "home_goals",
    "away_goals",
]

OPTIONAL_STAT_COLUMNS = [
    "home_xg",
    "away_xg",
    "home_shots",
    "away_shots",
    "home_sot",
    "away_sot",
    "home_possession",
    "away_possession",
    "home_corners",
    "away_corners",
    "home_yellow_cards",
    "away_yellow_cards",
    "home_red_cards",
    "away_red_cards",
]


def _mean(values: deque[float], fallback: float = 0.0) -> float:
    return float(np.mean(values)) if values else fallback


def _result_class(home_goals: int, away_goals: int) -> int:
    # 0 = home, 1 = draw, 2 = away
    if home_goals > away_goals:
        return 0
    if home_goals < away_goals:
        return 2
    return 1


def _implied_prob(odds: float | int | None) -> float:
    try:
        value = float(odds)
        return 1.0 / value if value > 1.0 else np.nan
    except (TypeError, ValueError):
        return np.nan


def build_features(raw: pd.DataFrame, window: int = 5) -> pd.DataFrame:
    missing = [column for column in REQUIRED_RAW_COLUMNS if column not in raw.columns]
    if missing:
        raise ValueError(f"Raw fixture dataset is missing columns: {missing}")

    frame = raw.copy()
    frame["kickoff_utc"] = pd.to_datetime(frame["kickoff_utc"], utc=True)
    frame = frame.sort_values(["kickoff_utc", "fixture_id"]).reset_index(drop=True)

    # State is updated only AFTER a feature row has been created.
    # This guarantees the current fixture result cannot leak into its own features.
    state: dict[str, dict[str, deque[float] | float | pd.Timestamp | None]] = defaultdict(
        lambda: {
            "points": deque(maxlen=window),
            "goals_for": deque(maxlen=window),
            "goals_against": deque(maxlen=window),
            "xg_for": deque(maxlen=window),
            "xg_against": deque(maxlen=window),
            "shots": deque(maxlen=window),
            "sot": deque(maxlen=window),
            "possession": deque(maxlen=window),
            "corners": deque(maxlen=window),
            "yellow_cards": deque(maxlen=window),
            "red_cards": deque(maxlen=window),
            "home_points": deque(maxlen=window),
            "home_goals_for": deque(maxlen=window),
            "home_goals_against": deque(maxlen=window),
            "home_shots": deque(maxlen=window),
            "home_sot": deque(maxlen=window),
            "home_corners": deque(maxlen=window),
            "home_yellow_cards": deque(maxlen=window),
            "away_points": deque(maxlen=window),
            "away_goals_for": deque(maxlen=window),
            "away_goals_against": deque(maxlen=window),
            "away_shots": deque(maxlen=window),
            "away_sot": deque(maxlen=window),
            "away_corners": deque(maxlen=window),
            "away_yellow_cards": deque(maxlen=window),
            "elo": 1500.0,
            "last_match": None,
        }
    )

    rows: list[dict] = []

    for fixture in frame.itertuples(index=False):
        home_id = str(fixture.home_team_id)
        away_id = str(fixture.away_team_id)
        home = state[home_id]
        away = state[away_id]

        kickoff = fixture.kickoff_utc
        home_last = home["last_match"]
        away_last = away["last_match"]
        home_rest = (kickoff - home_last).total_seconds() / 86400 if home_last is not None else 7.0
        away_rest = (kickoff - away_last).total_seconds() / 86400 if away_last is not None else 7.0

        home_elo = float(home["elo"])
        away_elo = float(away["elo"])

        row = {
            "fixture_id": fixture.fixture_id,
            "kickoff_utc": kickoff,
            "league": fixture.league,
            "season": fixture.season,
            "home_team_id": home_id,
            "away_team_id": away_id,
            "home_elo": home_elo,
            "away_elo": away_elo,
            "elo_diff": home_elo - away_elo,
            "home_form_points_5": _mean(home["points"]),
            "away_form_points_5": _mean(away["points"]),
            "home_goals_for_5": _mean(home["goals_for"]),
            "away_goals_for_5": _mean(away["goals_for"]),
            "home_goals_against_5": _mean(home["goals_against"]),
            "away_goals_against_5": _mean(away["goals_against"]),
            "home_xg_for_5": _mean(home["xg_for"], np.nan),
            "away_xg_for_5": _mean(away["xg_for"], np.nan),
            "home_xg_against_5": _mean(home["xg_against"], np.nan),
            "away_xg_against_5": _mean(away["xg_against"], np.nan),
            "home_shots_5": _mean(home["shots"]),
            "away_shots_5": _mean(away["shots"]),
            "home_sot_5": _mean(home["sot"]),
            "away_sot_5": _mean(away["sot"]),
            "home_possession_5": _mean(home["possession"], np.nan),
            "away_possession_5": _mean(away["possession"], np.nan),
            "home_corners_5": _mean(home["corners"], np.nan),
            "away_corners_5": _mean(away["corners"], np.nan),
            "home_yellow_cards_5": _mean(home["yellow_cards"], np.nan),
            "away_yellow_cards_5": _mean(away["yellow_cards"], np.nan),
            "home_red_cards_5": _mean(home["red_cards"], np.nan),
            "away_red_cards_5": _mean(away["red_cards"], np.nan),
            "home_home_form_points_5": _mean(home["home_points"]),
            "away_away_form_points_5": _mean(away["away_points"]),
            "home_home_goals_for_5": _mean(home["home_goals_for"]),
            "home_home_goals_against_5": _mean(home["home_goals_against"]),
            "away_away_goals_for_5": _mean(away["away_goals_for"]),
            "away_away_goals_against_5": _mean(away["away_goals_against"]),
            "home_home_shots_5": _mean(home["home_shots"], np.nan),
            "away_away_shots_5": _mean(away["away_shots"], np.nan),
            "home_home_sot_5": _mean(home["home_sot"], np.nan),
            "away_away_sot_5": _mean(away["away_sot"], np.nan),
            "home_home_corners_5": _mean(home["home_corners"], np.nan),
            "away_away_corners_5": _mean(away["away_corners"], np.nan),
            "home_home_yellow_cards_5": _mean(home["home_yellow_cards"], np.nan),
            "away_away_yellow_cards_5": _mean(away["away_yellow_cards"], np.nan),
            "home_rest_days": min(max(home_rest, 0.0), 30.0),
            "away_rest_days": min(max(away_rest, 0.0), 30.0),
            "home_implied_prob": _implied_prob(getattr(fixture, "home_odds", None)),
            "draw_implied_prob": _implied_prob(getattr(fixture, "draw_odds", None)),
            "away_implied_prob": _implied_prob(getattr(fixture, "away_odds", None)),
            "home_goals": int(fixture.home_goals),
            "away_goals": int(fixture.away_goals),
            "result_class": _result_class(int(fixture.home_goals), int(fixture.away_goals)),
        }
        rows.append(row)

        home_goals = int(fixture.home_goals)
        away_goals = int(fixture.away_goals)
        if home_goals > away_goals:
            home_points, away_points = 3.0, 0.0
            home_actual, away_actual = 1.0, 0.0
        elif home_goals < away_goals:
            home_points, away_points = 0.0, 3.0
            home_actual, away_actual = 0.0, 1.0
        else:
            home_points = away_points = 1.0
            home_actual = away_actual = 0.5

        expected_home = 1.0 / (1.0 + 10 ** ((away_elo - (home_elo + 65.0)) / 400.0))
        expected_away = 1.0 - expected_home
        k = 24.0
        home["elo"] = home_elo + k * (home_actual - expected_home)
        away["elo"] = away_elo + k * (away_actual - expected_away)

        home["points"].append(home_points)
        away["points"].append(away_points)
        home["goals_for"].append(float(home_goals))
        home["goals_against"].append(float(away_goals))
        away["goals_for"].append(float(away_goals))
        away["goals_against"].append(float(home_goals))

        home_xg = getattr(fixture, "home_xg", None)
        away_xg = getattr(fixture, "away_xg", None)
        if pd.notna(home_xg):
            home["xg_for"].append(float(home_xg))
            away["xg_against"].append(float(home_xg))
        if pd.notna(away_xg):
            away["xg_for"].append(float(away_xg))
            home["xg_against"].append(float(away_xg))

        home_shots = getattr(fixture, "home_shots", None)
        away_shots = getattr(fixture, "away_shots", None)
        home_sot = getattr(fixture, "home_sot", None)
        away_sot = getattr(fixture, "away_sot", None)
        if pd.notna(home_shots):
            home["shots"].append(float(home_shots))
        if pd.notna(away_shots):
            away["shots"].append(float(away_shots))
        if pd.notna(home_sot):
            home["sot"].append(float(home_sot))
        if pd.notna(away_sot):
            away["sot"].append(float(away_sot))

        # Venue-specific state is also updated only after the feature row.
        home["home_points"].append(home_points)
        home["home_goals_for"].append(float(home_goals))
        home["home_goals_against"].append(float(away_goals))
        away["away_points"].append(away_points)
        away["away_goals_for"].append(float(away_goals))
        away["away_goals_against"].append(float(home_goals))
        if pd.notna(home_shots):
            home["home_shots"].append(float(home_shots))
        if pd.notna(away_shots):
            away["away_shots"].append(float(away_shots))
        if pd.notna(home_sot):
            home["home_sot"].append(float(home_sot))
        if pd.notna(away_sot):
            away["away_sot"].append(float(away_sot))

        for prefix, team_state in (("home", home), ("away", away)):
            possession = getattr(fixture, f"{prefix}_possession", None)
            corners = getattr(fixture, f"{prefix}_corners", None)
            yellow_cards = getattr(fixture, f"{prefix}_yellow_cards", None)
            red_cards = getattr(fixture, f"{prefix}_red_cards", None)
            if pd.notna(possession):
                team_state["possession"].append(float(possession))
            if pd.notna(corners):
                team_state["corners"].append(float(corners))
            if pd.notna(yellow_cards):
                team_state["yellow_cards"].append(float(yellow_cards))
            if pd.notna(red_cards):
                team_state["red_cards"].append(float(red_cards))

        home_corners = getattr(fixture, "home_corners", None)
        away_corners = getattr(fixture, "away_corners", None)
        home_yellow = getattr(fixture, "home_yellow_cards", None)
        away_yellow = getattr(fixture, "away_yellow_cards", None)
        if pd.notna(home_corners):
            home["home_corners"].append(float(home_corners))
        if pd.notna(away_corners):
            away["away_corners"].append(float(away_corners))
        if pd.notna(home_yellow):
            home["home_yellow_cards"].append(float(home_yellow))
        if pd.notna(away_yellow):
            away["away_yellow_cards"].append(float(away_yellow))

        home["last_match"] = kickoff
        away["last_match"] = kickoff

    features = pd.DataFrame(rows)

    # Market probabilities may be absent for historical sources. Preserve rows
    # and impute only after chronological splitting in the training pipeline.
    return features


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--window", type=int, default=5)
    args = parser.parse_args()

    raw = pd.read_parquet(args.input) if args.input.suffix.lower() == ".parquet" else pd.read_csv(args.input)
    features = build_features(raw, window=args.window)
    args.output.parent.mkdir(parents=True, exist_ok=True)

    if args.output.suffix.lower() == ".parquet":
        features.to_parquet(args.output, index=False)
    else:
        features.to_csv(args.output, index=False)

    print(f"Wrote {len(features):,} leak-safe feature rows to {args.output}")
