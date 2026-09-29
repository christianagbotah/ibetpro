from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


DEFAULT_HORIZONS = (24, 6, 1)


def latest_snapshot_before(
    snapshots: pd.DataFrame,
    target: pd.Timestamp,
) -> pd.Series | None:
    eligible = snapshots[snapshots["captured_at"] <= target]
    if eligible.empty:
        return None
    return eligible.sort_values("captured_at").iloc[-1]


def build_horizon_corpus(
    fixtures: pd.DataFrame,
    odds: pd.DataFrame,
    horizon_hours: int,
) -> tuple[pd.DataFrame, dict]:
    context = fixtures.copy()
    history = odds.copy()
    context["kickoff_utc"] = pd.to_datetime(context["kickoff_utc"], utc=True)
    history["captured_at"] = pd.to_datetime(history["captured_at"], utc=True)

    rows: list[dict] = []
    missing: list[str] = []

    grouped = {
        str(fixture_id): group.sort_values("captured_at")
        for fixture_id, group in history.groupby("fixture_id")
    }

    for _, fixture in context.iterrows():
        fixture_id = str(fixture["fixture_id"])
        snapshots = grouped.get(fixture_id)
        if snapshots is None or snapshots.empty:
            missing.append(fixture_id)
            continue

        target = fixture["kickoff_utc"] - pd.Timedelta(hours=horizon_hours)
        selected = latest_snapshot_before(snapshots, target)
        if selected is None:
            missing.append(fixture_id)
            continue

        earlier = snapshots[snapshots["captured_at"] <= selected["captured_at"]]
        opening = earlier.iloc[0]

        row = fixture.to_dict()
        row.update(
            {
                "prediction_horizon_hours": horizon_hours,
                "market_asof_utc": selected["captured_at"].isoformat(),
                "market_snapshot_count": int(len(earlier)),
                "market_history_minutes": float(
                    (
                        selected["captured_at"] - opening["captured_at"]
                    ).total_seconds()
                    / 60.0
                ),
                "home_odds": selected["home_odds"],
                "draw_odds": selected["draw_odds"],
                "away_odds": selected["away_odds"],
                "opening_home_odds": opening["home_odds"],
                "opening_draw_odds": opening["draw_odds"],
                "opening_away_odds": opening["away_odds"],
            }
        )
        rows.append(row)

    result = pd.DataFrame(rows)
    if not result.empty:
        result = result.sort_values(["kickoff_utc", "fixture_id"]).reset_index(drop=True)

    total = len(context)
    report = {
        "horizon_hours": horizon_hours,
        "input_fixtures": total,
        "output_fixtures": int(len(result)),
        "coverage": float(len(result) / total) if total else 0.0,
        "missing_fixture_count": len(missing),
        "causal_rule": (
            "Selected odds snapshot is the latest captured_at not later than "
            "kickoff minus the requested horizon."
        ),
    }
    return result, report


def prepare(
    fixtures_path: Path,
    odds_path: Path,
    out: Path,
    horizons: tuple[int, ...],
    min_coverage: float,
) -> dict:
    fixtures = pd.read_csv(fixtures_path)
    odds = pd.read_csv(odds_path)
    out.mkdir(parents=True, exist_ok=True)

    reports = []
    for horizon in horizons:
        corpus, report = build_horizon_corpus(fixtures, odds, horizon)
        reports.append(report)
        output = out / f"licensed-{horizon}h.csv"
        corpus.to_csv(output, index=False)
        print(
            f"{horizon}h: {len(corpus)}/{len(fixtures)} fixtures "
            f"({report['coverage']:.1%})"
        )

    failures = [
        report
        for report in reports
        if report["coverage"] < min_coverage
    ]
    manifest = {
        "provider_context": "sportmonks",
        "provider_odds": "the-odds-api",
        "horizons": reports,
        "minimum_coverage": min_coverage,
        "research_ready": not failures,
    }
    (out / "licensed-horizon-manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    if failures:
        labels = ", ".join(f"{item['horizon_hours']}h" for item in failures)
        raise ValueError(
            f"Licensed corpus coverage is below {min_coverage:.0%} for: {labels}"
        )
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", required=True, type=Path)
    parser.add_argument("--odds", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=Path("data/licensed/horizons"))
    parser.add_argument("--horizons", nargs="+", type=int, default=list(DEFAULT_HORIZONS))
    parser.add_argument("--min-coverage", type=float, default=0.90)
    args = parser.parse_args()

    prepare(
        fixtures_path=args.fixtures,
        odds_path=args.odds,
        out=args.out,
        horizons=tuple(args.horizons),
        min_coverage=args.min_coverage,
    )
