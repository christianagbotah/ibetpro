from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import log_loss


@dataclass(frozen=True)
class BaselineMetrics:
    log_loss: float
    brier: float
    accuracy: float


def normalize_market_probs(row: pd.Series) -> np.ndarray | None:
    direct = [
        row.get("home_implied_prob"),
        row.get("draw_implied_prob"),
        row.get("away_implied_prob"),
    ]
    try:
        implied = np.array([float(value) for value in direct], dtype=float)
        if np.isfinite(implied).all() and implied.sum() > 0:
            return implied / implied.sum()
    except (TypeError, ValueError):
        pass

    odds = [row.get("home_odds"), row.get("draw_odds"), row.get("away_odds")]
    try:
        implied = np.array([1.0 / float(value) for value in odds], dtype=float)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    if not np.isfinite(implied).all() or implied.sum() <= 0:
        return None
    return implied / implied.sum()


def elo_probs(row: pd.Series) -> np.ndarray:
    home_elo = float(row["home_elo"])
    away_elo = float(row["away_elo"])
    home_adj = home_elo + 65.0
    p_home_no_draw = 1.0 / (1.0 + 10 ** ((away_elo - home_adj) / 400.0))

    draw = 0.25
    home = p_home_no_draw * (1.0 - draw)
    away = (1.0 - p_home_no_draw) * (1.0 - draw)
    return np.array([home, draw, away], dtype=float)


def multiclass_brier(y_true: np.ndarray, probabilities: np.ndarray) -> float:
    labels = np.eye(3)[y_true.astype(int)]
    return float(np.mean(np.sum((probabilities - labels) ** 2, axis=1)))


def evaluate_probabilities(y_true: np.ndarray, probabilities: np.ndarray) -> BaselineMetrics:
    predicted = np.argmax(probabilities, axis=1)
    return BaselineMetrics(
        log_loss=float(log_loss(y_true, probabilities, labels=[0, 1, 2])),
        brier=multiclass_brier(y_true, probabilities),
        accuracy=float(np.mean(predicted == y_true)),
    )


def evaluate_baselines(feature_csv: Path, start: str, end: str) -> dict:
    frame = pd.read_csv(feature_csv)
    frame["kickoff_utc"] = pd.to_datetime(frame["kickoff_utc"], utc=True)
    period = frame[
        (frame["kickoff_utc"] >= pd.Timestamp(start, tz="UTC"))
        & (frame["kickoff_utc"] <= pd.Timestamp(end, tz="UTC"))
    ].copy()

    if period.empty:
        raise ValueError("No fixtures in requested evaluation window")

    y_true = period["result_class"].astype(int).to_numpy()

    elo = np.stack([elo_probs(row) for _, row in period.iterrows()])
    result = {
        "rows": int(len(period)),
        "period": {"start": start, "end": end},
        "elo": evaluate_probabilities(y_true, elo).__dict__,
    }

    market_rows: list[int] = []
    market_probs: list[np.ndarray] = []
    for idx, row in period.iterrows():
        probs = normalize_market_probs(row)
        if probs is not None:
            market_rows.append(idx)
            market_probs.append(probs)

    if market_probs:
        market_y = period.loc[market_rows, "result_class"].astype(int).to_numpy()
        result["market"] = {
            **evaluate_probabilities(market_y, np.stack(market_probs)).__dict__,
            "rows": len(market_probs),
            "coverage": float(len(market_probs) / len(period)),
        }
    else:
        result["market"] = None

    return result


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--features", required=True, type=Path)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    result = evaluate_baselines(args.features, args.start, args.end)
    payload = json.dumps(result, indent=2)
    print(payload)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
