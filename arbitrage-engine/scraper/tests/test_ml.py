"""Tests for the self-learning layer: feature extraction + the ridge profit scorer."""
import random

import pytest

from src.ml.features import FEATURE_NAMES, build_features, feature_vector
from src.ml.model import ProfitScorer


def test_build_features_shape_and_values():
    row = {
        "ask_price": 1000, "target_sell_price": 2000, "net_profit": 600, "roi": 0.6,
        "total_cost": 1400, "platform_fee": 60, "processing_fee": 60, "insurance_fee": 12,
        "freight_cost": 250, "sold_count_30d": 5, "adv": 0.1667, "est_days_to_liquidate": 6,
        "condition": "Used", "brand": "Hobart", "model_number": "HL600",
        "comps": [{"sold_price": 2000}, {"sold_price": 2100}, {"sold_price": 1900}],
    }
    f = build_features(row)
    assert list(f.keys()) == FEATURE_NAMES
    assert f["margin_ratio"] == pytest.approx(0.3)
    assert f["cost_ratio"] == pytest.approx(0.7)
    assert f["fees_total"] == pytest.approx(132)
    assert f["n_comps"] == 3
    assert f["comp_min_ratio"] == pytest.approx(0.95)
    assert f["condition_score"] == 1
    assert f["brand_present"] == 1 and f["model_present"] == 1


def test_condition_score_parts_is_zero():
    assert build_features({"condition": "For parts or repair", "comps": []})["condition_score"] == 0
    assert build_features({"condition": "New", "comps": []})["condition_score"] == 2


def _synthetic(n=60, seed=0):
    rng = random.Random(seed)
    p = len(FEATURE_NAMES)
    X, y = [], []
    for _ in range(n):
        x = [rng.uniform(0, 10) for _ in range(p)]
        # truly-linear target in a few features + small noise
        y.append(2.0 * x[0] - 1.5 * x[6] + 0.7 * x[3] + 5.0 + rng.gauss(0, 0.02))
        X.append(x)
    return X, y


def test_model_learns_linear_signal():
    X, y = _synthetic()
    m = ProfitScorer()
    metrics = m.fit(X, y)
    assert metrics["r2"] > 0.99               # recovers the linear relationship
    assert metrics["cv_r2"] is not None and metrics["cv_r2"] > 0.95  # generalizes
    assert metrics["mae"] < metrics["baseline_mae"]  # beats predicting the mean
    pred, conf = m.predict(X[0])
    assert pred == pytest.approx(y[0], abs=1.0)
    assert 0.0 <= conf <= 1.0


def test_serialize_roundtrip_matches():
    X, y = _synthetic()
    m = ProfitScorer()
    m.fit(X, y)
    m2 = ProfitScorer.from_dict(m.feature_names, m.to_dict(), m.metrics, m.n_samples)
    for x in X[:5]:
        assert m2._raw_predict(x) == pytest.approx(m._raw_predict(x), abs=1e-9)


def test_unfitted_scorer_is_safe():
    m = ProfitScorer()
    assert m.predict([0.0] * len(FEATURE_NAMES)) == (0.0, 0.0)


def test_fit_requires_minimum_samples():
    with pytest.raises(ValueError):
        ProfitScorer().fit([[0.0] * len(FEATURE_NAMES)] * 3, [1, 2, 3])
