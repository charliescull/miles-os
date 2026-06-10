"""
Feature engineering for the profit scorer. Deterministic + pure so the EXACT same
vector is produced at scoring time (from a fresh opportunity) and at training time
(from a stored opportunity row). One source of truth = no train/serve skew.

Input is a flat dict with the opportunity's economic fields plus its `comps` list
(both the agent payload and a Supabase row satisfy this shape).
"""
from __future__ import annotations

import math
import statistics
from typing import Any

# Ordered — the model stores weights against this exact order. Append only; never
# reorder or remove without retraining (the model's feature_names guards against it).
FEATURE_NAMES: list[str] = [
    "ask_price",
    "target_sell_price",
    "net_profit",
    "roi",
    "total_cost",
    "freight_cost",
    "fees_total",
    "log_ask",
    "margin_ratio",        # net_profit / target_sell_price
    "cost_ratio",          # total_cost / target_sell_price
    "sold_count_30d",
    "adv",
    "days_to_liquidate",   # capped
    "n_comps",
    "comp_price_cv",       # std/mean of comp prices (dispersion / risk)
    "comp_min_ratio",      # min/mean of comp prices
    "condition_score",     # 2 new / 1 used / 0 parts
    "brand_present",
    "model_present",
]


def _f(v: Any, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _condition_score(condition: str | None) -> float:
    c = (condition or "").lower()
    if any(k in c for k in ("for parts", "parts only", "repair", "as is", "as-is", "not work", "broken")):
        return 0.0
    if "new" in c:
        return 2.0
    return 1.0


def build_features(row: dict) -> dict[str, float]:
    """Map an opportunity-shaped dict to the ordered feature dict."""
    ask = _f(row.get("ask_price"))
    target = _f(row.get("target_sell_price"))
    total_cost = _f(row.get("total_cost"))
    fees_total = _f(row.get("platform_fee")) + _f(row.get("processing_fee")) + _f(row.get("insurance_fee"))

    comps = row.get("comps") or []
    prices = [_f(c.get("sold_price")) for c in comps if _f(c.get("sold_price")) > 0]
    n_comps = len(prices)
    mean_p = statistics.fmean(prices) if prices else 0.0
    std_p = statistics.pstdev(prices) if n_comps > 1 else 0.0
    comp_cv = (std_p / mean_p) if mean_p > 0 else 0.0
    comp_min_ratio = (min(prices) / mean_p) if (prices and mean_p > 0) else 1.0

    days = _f(row.get("est_days_to_liquidate"))
    days = min(days, 60.0) if days and days < 9999 else 60.0

    feats = {
        "ask_price": ask,
        "target_sell_price": target,
        "net_profit": _f(row.get("net_profit")),
        "roi": _f(row.get("roi")),
        "total_cost": total_cost,
        "freight_cost": _f(row.get("freight_cost")),
        "fees_total": fees_total,
        "log_ask": math.log1p(max(ask, 0.0)),
        "margin_ratio": (_f(row.get("net_profit")) / target) if target > 0 else 0.0,
        "cost_ratio": (total_cost / target) if target > 0 else 0.0,
        "sold_count_30d": _f(row.get("sold_count_30d")),
        "adv": _f(row.get("adv")),
        "days_to_liquidate": days,
        "n_comps": float(n_comps),
        "comp_price_cv": comp_cv,
        "comp_min_ratio": comp_min_ratio,
        "condition_score": _condition_score(row.get("condition")),
        "brand_present": 1.0 if row.get("brand") else 0.0,
        "model_present": 1.0 if row.get("model_number") else 0.0,
    }
    return {k: feats[k] for k in FEATURE_NAMES}


def feature_vector(row: dict) -> list[float]:
    """Ordered list form of build_features."""
    f = build_features(row)
    return [f[k] for k in FEATURE_NAMES]
