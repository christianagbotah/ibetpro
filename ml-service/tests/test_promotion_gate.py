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
            "coverage": 1.0,
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


def test_low_market_coverage_blocks_promotion():
    value = candidate()
    value["feature_columns"] = [
        "home_implied_prob",
        "draw_implied_prob",
        "away_implied_prob",
    ]
    low_coverage = baselines()
    low_coverage["market"]["coverage"] = 0.40

    result = decide(value, low_coverage)

    assert result["all_gates_passed"] is False
    check = next(
        item for item in result["checks"] if item["name"] == "market_baseline_coverage"
    )
    assert check["passed"] is False


def market_aware_candidate(
    *,
    log_loss=0.90,
    delta=-0.02,
    ci_low=-0.04,
    ci_high=-0.005,
    coverage=1.0,
):
    value = candidate(log_loss=log_loss)
    value["feature_columns"] = [
        "home_implied_prob",
        "draw_implied_prob",
        "away_implied_prob",
    ]
    value["metrics"]["market_comparison"] = {
        "candidate_log_loss": log_loss,
        "benchmark_log_loss": log_loss - delta,
        "delta": delta,
        "bootstrap_ci95_low": ci_low,
        "bootstrap_ci95_high": ci_high,
        "probability_candidate_better": 0.98,
        "iterations": 4000,
        "rows": 500,
        "coverage": coverage,
    }
    return value


def test_significant_market_edge_can_pass_market_statistics():
    value = market_aware_candidate()
    result = decide(value, baselines())

    paired = next(
        item for item in result["checks"]
        if item["name"] == "paired_market_ci95_upper"
    )
    assert paired["passed"] is True


def test_market_edge_requires_confident_bootstrap_improvement():
    value = market_aware_candidate(
        delta=-0.003,
        ci_low=-0.015,
        ci_high=0.009,
    )

    result = decide(value, baselines())

    assert result["all_gates_passed"] is False
    paired = next(
        item for item in result["checks"]
        if item["name"] == "paired_market_ci95_upper"
    )
    assert paired["passed"] is False


def test_positive_paired_market_delta_is_rejected():
    value = market_aware_candidate(
        log_loss=0.95,
        delta=0.002,
        ci_low=-0.008,
        ci_high=0.013,
    )

    result = decide(value, baselines())

    delta_check = next(
        item for item in result["checks"]
        if item["name"] == "paired_market_log_loss_delta"
    )
    assert delta_check["passed"] is False


def test_market_equality_is_not_a_material_edge():
    value = market_aware_candidate(
        log_loss=0.9595,
        delta=0.0,
        ci_low=-1e-12,
        ci_high=-1e-15,
    )

    result = decide(value, baselines())

    assert result["all_gates_passed"] is False
    delta_check = next(
        item for item in result["checks"]
        if item["name"] == "paired_market_log_loss_delta"
    )
    assert delta_check["passed"] is False
