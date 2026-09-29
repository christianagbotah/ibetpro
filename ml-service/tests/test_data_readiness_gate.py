from training.data_readiness_gate import assess


def quality(rows=2000, shots=0.92, sot=0.88):
    return {
        "rows": rows,
        "coverage": {
            "home_shots": shots,
            "away_shots": shots,
            "home_sot": sot,
            "away_sot": sot,
        },
    }


def test_enriched_corpus_passes_when_core_coverage_is_high():
    result = assess(quality())
    assert result["enriched_training_ready"] is True
    assert all(check["passed"] for check in result["checks"])


def test_low_detail_coverage_blocks_enriched_training():
    result = assess(quality(shots=0.65))
    assert result["enriched_training_ready"] is False
    failed = {check["name"] for check in result["checks"] if not check["passed"]}
    assert "home_shots_coverage" in failed
    assert "away_shots_coverage" in failed


def test_too_few_rows_blocks_enriched_training():
    result = assess(quality(rows=800))
    assert result["enriched_training_ready"] is False
    rows = next(check for check in result["checks"] if check["name"] == "rows")
    assert rows["passed"] is False


def test_licensed_market_coverage_is_required_when_reported():
    report = quality()
    report["opening_market_coverage"] = 0.92
    report["near_kickoff_market_coverage"] = 0.60

    result = assess(report)

    assert result["enriched_training_ready"] is False
    failed = {check["name"] for check in result["checks"] if not check["passed"]}
    assert "near_kickoff_market_coverage" in failed


def test_licensed_market_coverage_passes_when_sufficient():
    report = quality()
    report["opening_market_coverage"] = 0.92
    report["near_kickoff_market_coverage"] = 0.84

    result = assess(report)

    assert result["enriched_training_ready"] is True
