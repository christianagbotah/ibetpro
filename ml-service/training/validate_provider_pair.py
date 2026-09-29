from __future__ import annotations

import argparse
import json


SUPPORTED_COMPETITIONS = {
    ("8", "soccer_epl"): "English Premier League",
}


def validate_pair(sportmonks_league_id: str, odds_api_sport_key: str) -> dict:
    key = (str(sportmonks_league_id).strip(), str(odds_api_sport_key).strip())
    competition = SUPPORTED_COMPETITIONS.get(key)
    return {
        "valid": competition is not None,
        "sportmonks_league_id": key[0],
        "odds_api_sport_key": key[1],
        "competition": competition,
        "supported_pairs": [
            {
                "sportmonks_league_id": league_id,
                "odds_api_sport_key": sport_key,
                "competition": name,
            }
            for (league_id, sport_key), name in SUPPORTED_COMPETITIONS.items()
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sportmonks-league-id", required=True)
    parser.add_argument("--odds-api-sport-key", required=True)
    args = parser.parse_args()

    result = validate_pair(
        args.sportmonks_league_id,
        args.odds_api_sport_key,
    )
    print(json.dumps(result, indent=2))
    if not result["valid"]:
        raise SystemExit(2)
