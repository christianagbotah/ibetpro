from __future__ import annotations

import argparse
import json
from pathlib import Path


DEFAULT_RULES = {
    "minimum_rows": 1500,
    "minimum_shots_coverage": 0.80,
    "minimum_sot_coverage": 0.80,
    "minimum_opening_market_coverage": 0.85,
    "minimum_near_kickoff_market_coverage": 0.75,
}


def assess(report: dict, rules: dict | None = None) -> dict:
    config = dict(DEFAULT_RULES)
    if rules:
        config.update(rules)

    coverage = report.get("coverage", {})
    checks: list[dict] = []

    def add(name: str, actual: float | int, threshold: float | int):
        checks.append(
            {
                "name": name,
                "actual": actual,
                "threshold": threshold,
                "relation": ">=",
                "passed": actual >= threshold,
            }
        )

    add("rows", int(report.get("rows", 0)), int(config["minimum_rows"]))

    for column in ("home_shots", "away_shots"):
        add(
            f"{column}_coverage",
            float(coverage.get(column, 0.0)),
            float(config["minimum_shots_coverage"]),
        )

    for column in ("home_sot", "away_sot"):
        add(
            f"{column}_coverage",
            float(coverage.get(column, 0.0)),
            float(config["minimum_sot_coverage"]),
        )

    if "opening_market_coverage" in report:
        add(
            "opening_market_coverage",
            float(report.get("opening_market_coverage", 0.0)),
            float(config["minimum_opening_market_coverage"]),
        )

    if "near_kickoff_market_coverage" in report:
        add(
            "near_kickoff_market_coverage",
            float(report.get("near_kickoff_market_coverage", 0.0)),
            float(config["minimum_near_kickoff_market_coverage"]),
        )

    ready = all(check["passed"] for check in checks)
    return {
        "enriched_training_ready": ready,
        "checks": checks,
        "rules": config,
        "note": (
            "Corpus has enough enriched-stat and licensed market coverage for an enriched-model experiment."
            if ready
            else "Keep enriched features disabled until all core coverage gates pass."
        ),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--quality", required=True, type=Path)
    parser.add_argument("--rules", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    report = json.loads(args.quality.read_text(encoding="utf-8"))
    rules = (
        json.loads(args.rules.read_text(encoding="utf-8"))
        if args.rules
        else None
    )
    result = assess(report, rules)
    payload = json.dumps(result, indent=2)
    print(payload)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")

    if not result["enriched_training_ready"]:
        raise SystemExit(2)
