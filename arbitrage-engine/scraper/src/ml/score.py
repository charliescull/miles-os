"""
Scoring side of the learning loop: load the active model from Supabase (once per
process) and predict an opportunity's realized net profit. Cold-start safe — with no
trained model yet, it falls back to the deterministic net profit with zero confidence.
"""
from __future__ import annotations

import logging

from .features import build_features
from .model import ProfitScorer

log = logging.getLogger("arbitrage.ml")

_loaded = False
_scorer: ProfitScorer | None = None


def get_active_scorer() -> ProfitScorer | None:
    """Fetch + cache the active model. Returns None if none trained / on error."""
    global _loaded, _scorer
    if not _loaded:
        _loaded = True
        try:
            from ..supabase_client import fetch_active_model
            row = fetch_active_model()
            if row:
                _scorer = ProfitScorer.from_dict(
                    row["feature_names"], row["params"], row.get("metrics"), row.get("n_samples", 0)
                )
                log.info("loaded model: %d samples, metrics=%s", _scorer.n_samples, _scorer.metrics)
        except Exception as exc:  # no ml_model table yet, etc.
            log.warning("no active model loaded (%s)", exc)
            _scorer = None
    return _scorer


def score_row(row: dict) -> tuple[dict, float, float]:
    """Return (features, predicted_realized_net_profit, confidence) for an opp-shaped row."""
    feats = build_features(row)
    scorer = get_active_scorer()
    if scorer is None:
        return feats, round(float(row.get("net_profit") or 0.0), 2), 0.0  # deterministic fallback
    x = [feats[k] for k in scorer.feature_names]
    score, conf = scorer.predict(x)
    return feats, round(score, 2), conf
