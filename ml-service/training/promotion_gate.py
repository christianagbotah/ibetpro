from __future__ import annotations

import argparse
import json
from pathlib import Path


DEFAULT_GATES = {
    "max_log_loss": 1.05,
    "max_brier": 0.66,
    "min_accuracy": 0.40,
    "max_goal_mae": 1.20,
    "must_beat_elo_log_loss_by": 0.005,
    "must_beat_market_log_loss_by": 0.0,
}


def decide(candidate: dict, baselines: dict, gates: dict | None = None) -> dict:
    rules = dict(DEFAULT_GATES)
    if gates:
        rules.update(gates)

    checks: list[dict] = []

    result_metrics = candidate["metrics"]["result"]
    goal_metrics = candidate["metrics"]["goals"]

    def add(name: str, passed: bool, actual, threshold, relation: str):
        checks.append(
            {
                "name": name,
                "passed": bool(passed),
                "actual": actual,
                "threshold": threshold,
                "relation": relation,
            }
        )

    add(
        "candidate_log_loss",
        result_metrics["log_loss"] <= rules["max_log_loss"],
        result_metrics["log_loss"],
        rules["max_log_loss"],
        "<=",
    )
    add(
        "candidate_brier",
        result_metrics["multiclass_brier"] <= rules["max_brier"],
        result_metrics["multiclass_brier"],
        rules["max_brier"],
        "<=",
    )
    add(
        "candidate_accuracy",
        result_metrics["accuracy"] >= rules["min_accuracy"],
        result_metrics["accuracy"],
        rules["min_accuracy"],
        ">=",
    )
    max_goal_mae = max(goal_metrics["home_mae"], goal_metrics["away_mae"])
    add(
        "goal_mae",
        max_goal_mae <= rules["max_goal_mae"],
        max_goal_mae,
        rules["max_goal_mae"],
        "<=",
    )

    elo_log_loss = baselines["elo"]["log_loss"]
    elo_target = elo_log_loss - rules["must_beat_elo_log_loss_by"]
    add(
        "beat_elo_log_loss",
        result_metrics["log_loss"] <= elo_target,
        result_metrics["log_loss"],
        elo_target,
        "<=",
    )

    market = baselines.get("market")
    if market:
        market_log_loss = market["log_loss"]
        market_target = market_log_loss - rules["must_beat_market_log_loss_by"]
        add(
            "beat_market_log_loss",
            result_metrics["log_loss"] <= market_target,
            result_metrics["log_loss"],
            market_target,
            "<=",
        )

    passed = all(check["passed"] for check in checks)

    return {
        "promotion_status": "eligible-for-shadow" if passed else "rejected",
        "all_gates_passed": passed,
        "checks": checks,
        "note": (
            "Eligible for shadow evaluation only; this is not a live-production promotion."
            if passed
            else "Candidate remains blocked from shadow promotion until all gates pass."
        ),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--baselines", required=True, type=Path)
    parser.add_argument("--gates", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    candidate = json.loads(args.candidate.read_text(encoding="utf-8"))
    baselines = json.loads(args.baselines.read_text(encoding="utf-8"))
    custom_gates = (
        json.loads(args.gates.read_text(encoding="utf-8")) if args.gates else None
    )

    decision = decide(candidate, baselines, custom_gates)
    payload = json.dumps(decision, indent=2)
    print(payload)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")

    if not decision["all_gates_passed"]:
        raise SystemExit(2)
