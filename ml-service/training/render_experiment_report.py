from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_json(path: Path) -> dict | None:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def fmt(value, digits=4):
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def render(work_dir: Path) -> str:
    quality = load_json(work_dir / "corpus-quality.json")
    candidate = load_json(work_dir / "candidate" / "metadata.json")
    baselines = load_json(work_dir / "baselines.json")
    promotion = load_json(work_dir / "promotion.json")

    lines = [
        "# iBetPro Model Experiment Report",
        "",
        "This report is research evidence only. Passing model gates permits shadow evaluation; it does not authorize live production use.",
        "",
    ]

    if quality:
        lines += [
            "## Corpus",
            "",
            f"- Rows: **{quality.get('rows', '—')}**",
            f"- Source files: **{quality.get('files', '—')}**",
            f"- Date range: **{quality.get('start', '—')} → {quality.get('end', '—')}**",
            f"- Duplicates removed: **{quality.get('duplicates_removed', '—')}**",
            f"- Leagues: {', '.join(quality.get('leagues', [])) or '—'}",
            f"- Seasons: {', '.join(quality.get('seasons', [])) or '—'}",
            "",
            "### Missing feature coverage",
            "",
            "| Feature | Missing rows |",
            "| --- | ---: |",
        ]
        for key, value in quality.get("missing", {}).items():
            lines.append(f"| {key} | {value} |")
        lines.append("")

    if candidate:
        result = candidate.get("metrics", {}).get("result", {})
        goals = candidate.get("metrics", {}).get("goals", {})
        rows = candidate.get("metrics", {}).get("rows", {})
        lines += [
            "## Candidate",
            "",
            f"- Model: **{candidate.get('model_version', '—')}**",
            f"- Train rows: **{rows.get('train', '—')}**",
            f"- Calibration rows: **{rows.get('calibration', '—')}**",
            f"- Test rows: **{rows.get('test', '—')}**",
            "",
            "| Metric | Candidate |",
            "| --- | ---: |",
            f"| Log loss | {fmt(result.get('log_loss'))} |",
            f"| Multiclass Brier | {fmt(result.get('multiclass_brier'))} |",
            f"| Accuracy | {fmt(result.get('accuracy'))} |",
            f"| Expected calibration error | {fmt(result.get('expected_calibration_error'))} |",
            f"| Ranked probability score | {fmt(result.get('ranked_probability_score'))} |",
            f"| Home-goal MAE | {fmt(goals.get('home_mae'))} |",
            f"| Away-goal MAE | {fmt(goals.get('away_mae'))} |",
            "",
        ]

    if baselines:
        lines += [
            "## Baselines",
            "",
            "| Baseline | Rows | Log loss | Brier | Accuracy |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
        elo = baselines.get("elo") or {}
        lines.append(
            f"| ELO | {baselines.get('rows', '—')} | {fmt(elo.get('log_loss'))} | {fmt(elo.get('brier'))} | {fmt(elo.get('accuracy'))} |"
        )
        market = baselines.get("market")
        if market:
            lines.append(
                f"| Market | {market.get('rows', '—')} | {fmt(market.get('log_loss'))} | {fmt(market.get('brier'))} | {fmt(market.get('accuracy'))} |"
            )
        else:
            lines.append("| Market | — | — | — | — |")
        lines.append("")

    if promotion:
        lines += [
            "## Promotion decision",
            "",
            f"**{promotion.get('promotion_status', 'unknown')}**",
            "",
            promotion.get("note", ""),
            "",
            "| Gate | Passed | Actual | Threshold |",
            "| --- | :---: | ---: | ---: |",
        ]
        for check in promotion.get("checks", []):
            lines.append(
                f"| {check.get('name')} | {'YES' if check.get('passed') else 'NO'} | {fmt(check.get('actual'))} | {check.get('relation', '')} {fmt(check.get('threshold'))} |"
            )
        lines.append("")

    if not any([quality, candidate, baselines, promotion]):
        lines.append("No experiment artifacts were produced.")

    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    report = render(args.work_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(report, encoding="utf-8")
    print(report)
