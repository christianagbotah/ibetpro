from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path("training/corpus-manifest.json"))
    parser.add_argument("--out", type=Path, default=Path("data/historical"))
    parser.add_argument("--include-detail", action="store_true")
    parser.add_argument("--pause", type=float, default=0.2)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    provider = manifest.get("provider")
    if provider != "api-football":
        raise ValueError(f"Unsupported corpus provider: {provider}")

    args.out.mkdir(parents=True, exist_ok=True)

    collected: list[str] = []
    for competition in manifest["competitions"]:
        league_id = int(competition["league_id"])
        name = competition["name"]
        for season in competition["seasons"]:
            print(f"Collecting {name} ({league_id}) season {season}")
            command = [
                "python",
                "training/collect_api_football.py",
                "--league",
                str(league_id),
                "--season",
                str(season),
                "--out",
                str(args.out),
                "--pause",
                str(args.pause),
            ]
            if args.include_detail:
                command.append("--include-detail")
            subprocess.run(command, check=True)
            collected.append(f"api-football-{league_id}-{season}.csv")

    index = {
        "provider": provider,
        "manifest": str(args.manifest),
        "files": collected,
        "count": len(collected),
    }
    (args.out / "corpus-index.json").write_text(
        json.dumps(index, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(index, indent=2))


if __name__ == "__main__":
    main()
