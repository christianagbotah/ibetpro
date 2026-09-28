from training.promotion_gate import decide


def candidate(log_loss=0.90, brier=0.55, accuracy=0.48, ece=0.06, rps=0.20, home_mae=0.85, away_mae=0.90):
    return {
        "metrics": {
            "result": {
                "log_loss": log_loss,
                "multiclass_brier": brier,
                "accuracy": accuracy,
                "expected_calibration_error": ece,
                "ranked_probability_score": rps,
            },
            "goals": {
                "home_mae": home_mae,
                "away_mae": away_mae,
            },
        }
    }


def baselines():
    return {
        "elo": {
            "log_loss": 1.02,
            "brier": 0.64,
            "accuracy": 0.41,
        },
        "market": {
            "log_loss": 0.96,
            "brier": 0.60,
            "accuracy": 0.44,
            "rows": 500,
        },
    }


def test_strong_candidate_is_shadow_eligible():
    result = decide(candidate(), baselines())
    assert result["all_gates_passed"] is True
    assert result["promotion_status"] == "eligible-for-shadow"


def test_candidate_that_loses_to_market_is_rejected():
    result = decide(candidate(log_loss=0.98), baselines())
    assert result["all_gates_passed"] is False
    assert result["promotion_status"] == "rejected"
    market_check = next(
        check for check in result["checks"] if check["name"] == "beat_market_log_loss"
    )
    assert market_check["passed"] is False


def test_bad_goal_model_blocks_promotion():
    result = decide(candidate(home_mae=1.5), baselines())
    assert result["all_gates_passed"] is False
    goal_check = next(
        check for check in result["checks"] if check["name"] == "goal_mae"
    )
    assert goal_check["passed"] is False


def test_bad_calibration_blocks_promotion():
    result = decide(candidate(ece=0.16), baselines())
    assert result["all_gates_passed"] is False
    calibration_check = next(
        check for check in result["checks"] if check["name"] == "candidate_ece"
    )
    assert calibration_check["passed"] is False


def test_market_aware_candidate_requires_market_baseline():
    value = candidate()
    value["feature_columns"] = [
        "home_implied_prob",
        "draw_implied_prob",
        "away_implied_prob",
    ]
    no_market = {"elo": baselines()["elo"], "market": None}

    result = decide(value, no_market)

    assert result["all_gates_passed"] is False
    check = next(
        item for item in result["checks"] if item["name"] == "market_baseline_available"
    )
    assert check["passed"] is False
