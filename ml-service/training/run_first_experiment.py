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
    parser.add_argument("--raw-dir", type=Path, default=Path("data/historical"))
    parser.add_argument("--work-dir", type=Path, default=Path("data/run"))
    parser.add_argument("--train-end", default="2023-06-30")
    parser.add_argument("--calibration-end", default="2024-06-30")
    parser.add_argument("--test-end", default="2025-06-30")
    args = parser.parse_args()

    args.work_dir.mkdir(parents=True, exist_ok=True)
    corpus = args.work_dir / "football.csv"
    features = args.work_dir / "features.csv"
    model_dir = args.work_dir / "candidate"
    baselines = args.work_dir / "baselines.json"
    gate = args.work_dir / "promotion.json"

    run([
        "python",
        "training/merge_corpus.py",
        "--input-dir",
        str(args.raw_dir),
        "--output",
        str(corpus),
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
        str(model_dir),
        "--train-end",
        args.train_end,
        "--calibration-end",
        args.calibration_end,
        "--test-end",
        args.test_end,
    ])

    run([
        "python",
        "training/evaluate_baselines.py",
        "--features",
        str(features),
        "--start",
        args.calibration_end,
        "--end",
        args.test_end,
        "--output",
        str(baselines),
    ])

    gate_code = run([
        "python",
        "training/promotion_gate.py",
        "--candidate",
        str(model_dir / "metadata.json"),
        "--baselines",
        str(baselines),
        "--output",
        str(gate),
    ], allowed_codes=(0, 2))

    result = {
        "corpus": str(corpus),
        "features": str(features),
        "candidate": str(model_dir),
        "baselines": str(baselines),
        "promotion": str(gate),
        "promotion_gate_exit_code": gate_code,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
