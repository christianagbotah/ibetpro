from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def run(command: list[str], allowed_codes: tuple[int, ...] = (0,)) -> int:
    print("$", " ".join(command))
    completed = subprocess.run(command, check=False)
    if completed.returncode not in allowed_codes:
        raise subprocess.CalledProcessError(completed.returncode, command)
    return completed.returncode


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", type=Path, default=Path("data/public-core-run"))
    parser.add_argument("--train-end", default="2023-06-30")
    parser.add_argument("--calibration-end", default="2024-06-30")
    parser.add_argument("--test-end", default="2025-06-30")
    args = parser.parse_args()

    args.work_dir.mkdir(parents=True, exist_ok=True)
    corpus_dir = args.work_dir / "corpus"
    corpus = corpus_dir / "football-data-core.csv"
    features = args.work_dir / "features.csv"
    candidate = args.work_dir / "candidate"
    baselines = args.work_dir / "baselines.json"
    promotion = args.work_dir / "promotion.json"

    run([
        "python",
        "training/collect_football_data.py",
        "--leagues",
        "E0",
        "SP1",
        "--start-years",
        "2019",
        "2020",
        "2021",
        "2022",
        "2023",
        "2024",
        "2025",
        "--output-dir",
        str(corpus_dir),
    ])

    run([
        "python",
        "training/build_features.py",
        "--input",
        str(corpus),
        "--output",
        str(features),
    ])

    run([
        "python",
        "training/train_xgb.py",
        "--dataset",
        str(features),
        "--output",
        str(candidate),
        "--train-end",
        args.train_end,
        "--calibration-end",
        args.calibration_end,
        "--test-end",
        args.test_end,
        "--feature-profile",
        "core",
    ])

    # Evaluate baselines on the exact test period used by the candidate.
    run([
        "python",
        "training/evaluate_baselines.py",
        "--features",
        str(features),
        "--start",
        "2024-07-01",
        "--end",
        args.test_end,
        "--output",
        str(baselines),
    ])

    gate_code = run([
        "python",
        "training/promotion_gate.py",
        "--candidate",
        str(candidate / "metadata.json"),
        "--baselines",
        str(baselines),
        "--output",
        str(promotion),
    ], allowed_codes=(0, 2))

    summary = {
        "source": "football-data.co.uk",
        "feature_profile": "core",
        "candidate": str(candidate),
        "baselines": str(baselines),
        "promotion": str(promotion),
        "promotion_gate_exit_code": gate_code,
        "untouched_holdout_starts": "2025-07-01",
    }
    (args.work_dir / "run-summary.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
