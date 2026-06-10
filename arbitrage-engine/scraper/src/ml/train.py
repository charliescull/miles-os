"""
Train the unified profit scorer from accumulated outcomes and store it active.

  python -m src.ml.train

Labels (the "learn from itself" signal):
  - decision='bought' with a realized sale price  -> y = realized net profit ($)
  - decision='passed'                             -> y = 0  (human judged it not worth pursuing)

Realized net profit is recomputed from the actual sale price using the same fee math
as the predictor, so the target reflects true booked profit, not the original estimate.
"""
from __future__ import annotations

import logging

from .. import calc, supabase_client as db
from .features import FEATURE_NAMES, feature_vector
from .model import MIN_SAMPLES_TO_FIT, ProfitScorer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s")
log = logging.getLogger("arbitrage.ml.train")


def realized_net_profit(row: dict) -> float | None:
    """True booked profit from the actual sale price (fees recomputed on realized price)."""
    sp = row.get("realized_sale_price")
    if sp is None:
        return None
    sp = float(sp)
    ask = float(row.get("ask_price") or 0.0)
    freight = float(row.get("freight_cost") or 0.0)
    costs = calc.platform_fee(sp) + calc.processing_fee(sp) + calc.insurance_fee(sp, ask)
    return round(sp - (ask + freight + costs), 2)


def build_dataset(rows: list[dict]) -> tuple[list[list[float]], list[float], int, int]:
    X: list[list[float]] = []
    y: list[float] = []
    n_sold = n_passed = 0
    for r in rows:
        if r.get("decision") == "bought" and r.get("realized_sale_price") is not None:
            label = r.get("realized_net_profit")
            label = float(label) if label is not None else realized_net_profit(r)
            n_sold += 1
        elif r.get("decision") == "passed":
            label = 0.0
            n_passed += 1
        else:
            continue
        if label is None:
            continue
        X.append(feature_vector(r))
        y.append(label)
    return X, y, n_sold, n_passed


def main() -> None:
    rows = db.fetch_labeled_opportunities()
    X, y, n_sold, n_passed = build_dataset(rows)
    log.info("labeled outcomes: %d sold, %d passed -> %d usable", n_sold, n_passed, len(X))

    if len(X) < MIN_SAMPLES_TO_FIT:
        log.warning("Not enough labeled outcomes (%d, need >= %d). Mark opportunities "
                    "bought+sold or passed on the dashboard first.", len(X), MIN_SAMPLES_TO_FIT)
        return

    lambdas = [0.1, 1.0, 10.0, 50.0] if len(X) >= 10 else [1.0]
    best = None
    for lam in lambdas:
        m = ProfitScorer()
        m.fit(X, y, lam=lam)
        cv = m.metrics.get("cv_r2")
        key = cv if cv is not None else -m.metrics["mae"]
        if best is None or key > best[0]:
            best = (key, lam, m)

    _, lam, model = best
    db.save_model(model.feature_names, model.to_dict(), model.metrics, model.n_samples)
    log.info("Stored active ridge_profit model | n=%d lambda=%s metrics=%s",
             model.n_samples, lam, model.metrics)


if __name__ == "__main__":
    main()
