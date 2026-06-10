"""
THE ALGORITHM — pure, deterministic, side-effect-free arbitrage math.

This module has zero I/O and zero network. That is deliberate: it is the part of
the system that decides money, so it is fully unit-tested (see tests/test_calc.py)
and can be reasoned about in isolation. Every formula maps 1:1 to the strategy
spec and is driven by `config.StrategyConfig` so thresholds are never hardcoded.
"""
from __future__ import annotations

import statistics
from datetime import date, timedelta
from typing import Iterable, Sequence

from .config import StrategyConfig, strategy
from .models import Comparable, Valuation


# ── Price ────────────────────────────────────────────────────────────────
def price_outlier_filter(
    comps: Sequence[Comparable], cfg: StrategyConfig = strategy
) -> list[Comparable]:
    """
    Deterministic backstop for parts/accessories that slipped past the semantic
    `is_part` filter: once there are enough comps to have a stable median, drop any
    whose sold_price is below `comp_outlier_floor_ratio * median`. With too few comps
    (< comp_min_for_outlier_filter) we can't trust the median, so we leave them alone.
    """
    comps = list(comps)
    if len(comps) < cfg.comp_min_for_outlier_filter:
        return comps
    median = statistics.median(c.sold_price for c in comps)
    floor = cfg.comp_outlier_floor_ratio * median
    kept = [c for c in comps if c.sold_price >= floor]
    return kept or comps  # never filter everything away


def target_sell_price(comps: Sequence[Comparable], cfg: StrategyConfig = strategy) -> float:
    """
    Average of the N most-recent sold comps (N = cfg.comps_for_price, default 3),
    computed over comps that pass `price_outlier_filter` (cheap parts removed).

    Comps are sorted by sold_date descending (None dates sort last) so we always
    price off the freshest market data. Raises if there are no comps — you cannot
    value an item with no market signal.
    """
    if not comps:
        raise ValueError("cannot price an item with zero comps")

    usable = price_outlier_filter(comps, cfg)
    ordered = sorted(
        usable,
        key=lambda c: (c.sold_date or date.min),
        reverse=True,
    )
    recent = ordered[: cfg.comps_for_price]
    return sum(c.sold_price for c in recent) / len(recent)


# ── eBay Business & Industrial tiered final-value fee ──────────────────────
def platform_fee(sell_price: float, cfg: StrategyConfig = strategy) -> float:
    """
    The fee anomaly that powers Strategy B:

        3% on the portion up to $15,000  +  0.5% on the portion above $15,000

    Example: a $20,000 sale -> 0.03*15000 + 0.005*5000 = 450 + 25 = $475.
    """
    tier1 = min(sell_price, cfg.fee_breakpoint_usd) * cfg.fee_tier1_rate
    tier2 = max(0.0, sell_price - cfg.fee_breakpoint_usd) * cfg.fee_tier2_rate
    return tier1 + tier2


def processing_fee(sell_price: float, cfg: StrategyConfig = strategy) -> float:
    """Payment processing, ~3% of sell price (flat assumption)."""
    return sell_price * cfg.processing_rate


def insurance_fee(sell_price: float, ask_price: float, cfg: StrategyConfig = strategy) -> float:
    """
    Secursus 3rd-party insurance, 0.6% of declared value. `insurance_base` selects
    whether the declared value is the sell price (value in transit, default) or the
    ask price (acquisition cost).
    """
    base = ask_price if cfg.insurance_base == "ask" else sell_price
    return base * cfg.insurance_rate


def freight_cost(weight_lb: float | None, cfg: StrategyConfig = strategy) -> float:
    """
    Flat $250 heavy-freight assumption. A weight-based seam is provided for when
    listings expose weight: a crude $0.85/lb model that never undercuts the flat
    floor. Tune freely — kept simple and conservative by default.
    """
    if weight_lb and weight_lb > 0:
        return max(cfg.freight_flat_usd, round(weight_lb * 0.85, 2))
    return cfg.freight_flat_usd


# ── Liquidity ──────────────────────────────────────────────────────────────
def sold_in_window(
    comps: Iterable[Comparable],
    lookback_days: int,
    today: date | None = None,
) -> int:
    """
    Count comps sold within the trailing `lookback_days`. Comps with no sold_date
    are conservatively EXCLUDED from the liquidity count (we don't credit liquidity
    we can't date).
    """
    today = today or date.today()
    cutoff = today - timedelta(days=lookback_days)
    return sum(1 for c in comps if c.sold_date and c.sold_date >= cutoff)


def liquidity(
    comps: Sequence[Comparable],
    cfg: StrategyConfig = strategy,
    today: date | None = None,
) -> tuple[int, float, float, bool]:
    """
    Returns (sold_count_30d, adv, est_days_to_liquidate, ok).

        ADV (avg daily volume) = sold_count / lookback_days
        est_days_to_liquidate  = lookback_days / sold_count   (time to clear one unit)
        ok                     = est_days_to_liquidate <= max_days_to_liquidate

    Zero sales in the window => infinite days => not liquid => dropped.
    """
    n = sold_in_window(comps, cfg.comps_lookback_days, today=today)
    if n <= 0:
        return 0, 0.0, float("inf"), False

    adv = n / cfg.comps_lookback_days
    est_days = cfg.comps_lookback_days / n
    return n, adv, est_days, est_days <= cfg.max_days_to_liquidate


# ── The full valuation ─────────────────────────────────────────────────────
def evaluate(
    ask_price: float,
    comps: Sequence[Comparable],
    weight_lb: float | None = None,
    cfg: StrategyConfig = strategy,
    today: date | None = None,
) -> Valuation:
    """
    Run the complete landed-cost model and triggers for one asset.

        net_profit = sell - (ask + freight + platform + processing + insurance)
        roi        = net_profit / ask
        opportunity = (roi > roi_threshold) AND liquidity_ok

    State tax is $0 (resale exemption) and therefore omitted entirely.
    """
    if ask_price <= 0:
        raise ValueError("ask_price must be positive")

    sell = target_sell_price(comps, cfg)
    freight = freight_cost(weight_lb, cfg)
    fee = platform_fee(sell, cfg)
    processing = processing_fee(sell, cfg)
    insurance = insurance_fee(sell, ask_price, cfg)

    total_cost = ask_price + freight + fee + processing + insurance
    net_profit = sell - total_cost
    roi = net_profit / ask_price

    sold_30d, adv, est_days, liq_ok = liquidity(comps, cfg, today=today)

    passes_roi = roi > cfg.roi_threshold
    is_opp = passes_roi and liq_ok

    return Valuation(
        ask_price=round(ask_price, 2),
        target_sell_price=round(sell, 2),
        freight_cost=round(freight, 2),
        platform_fee=round(fee, 2),
        processing_fee=round(processing, 2),
        insurance_fee=round(insurance, 2),
        total_cost=round(total_cost, 2),
        net_profit=round(net_profit, 2),
        roi=round(roi, 4),
        sold_count_30d=sold_30d,
        adv=round(adv, 4),
        est_days_to_liquidate=(
            round(est_days, 2) if est_days != float("inf") else float("inf")
        ),
        liquidity_ok=liq_ok,
        passes_roi=passes_roi,
        is_opportunity=is_opp,
    )
