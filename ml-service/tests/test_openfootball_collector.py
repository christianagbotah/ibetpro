from training.collect_openfootball import final_score


def test_final_score_supports_modern_object_shape():
    assert final_score({"score": {"ht": [1, 0], "ft": [2, 1]}}) == [2, 1]


def test_final_score_supports_legacy_list_shape():
    assert final_score({"score": [3, 2]}) == [3, 2]


def test_final_score_rejects_incomplete_or_invalid_shapes():
    assert final_score({"score": {"ht": [0, 0]}}) is None
    assert final_score({"score": [1]}) is None
    assert final_score({"score": None}) is None
