"""
Unit tests for the arbitrage math. These verify the part that decides money, so
they pin every formula to an explicit, hand-computed expectation. Hermetic: a
fixed StrategyConfig is used so results never depend on the environment.

Run:  python -m pytest  (from scraper/)
"""
from datetime import date

import pytest

from src.calc import (
    evaluate,
    freight_cost,
    insurance_fee,
    liquidity,
    platform_fee,
    price_outlier_filter,
    processing_fee,
    target_sell_price,
)
from src.config import StrategyConfig
from src.models import Comparable

# Explicit spec defaults — independent of any .env so CI is deterministic.
CFG = StrategyConfig(
    roi_threshold=0.25,
    max_days_to_liquidate=14,
    freight_flat_usd=250,
    processing_rate=0.03,
    insurance_rate=0.006,
    insurance_base="sell",
    fee_tier1_rate=0.03,
    fee_tier2_rate=0.005,
    fee_breakpoint_usd=15000,
    comps_lookback_days=30,
    comps_for_price=3,
    comp_outlier_floor_ratio=0.4,
    comp_min_for_outlier_filter=4,
)
TODAY = date(2026, 6, 7)


def comp(price, days_ago):
    from datetime import timedelta
    return Comparable(sold_price=price, sold_date=TODAY - timedelta(days=days_ago))


# ── platform fee (the B&I anomaly) ─────────────────────────────────────────
@pytest.mark.parametrize("sell,expected", [
    (10_000, 300.0),     # all in tier 1: 10000 * 3%
    (15_000, 450.0),     # exactly at breakpoint: 15000 * 3%
    (20_000, 475.0),     # 15000*3% + 5000*0.5% = 450 + 25
    (0, 0.0),
])
def test_platform_fee_tiers(sell, expected):
    assert platform_fee(sell, CFG) == pytest.approx(expected)


def test_processing_fee():
    assert processing_fee(2000, CFG) == pytest.approx(60.0)


def test_insurance_fee_sell_base():
    assert insurance_fee(2000, 1000, CFG) == pytest.approx(12.0)  # 0.6% of 2000


def test_insurance_fee_ask_base():
    cfg = StrategyConfig(insurance_base="ask", insurance_rate=0.006)
    assert insurance_fee(2000, 1000, cfg) == pytest.approx(6.0)   # 0.6% of 1000


# ── freight ────────────────────────────────────────────────────────────────
def test_freight_flat_when_no_weight():
    assert freight_cost(None, CFG) == 250


def test_freight_weight_based_floor():
    assert freight_cost(100, CFG) == 250          # 100*0.85=85 < floor
    assert freight_cost(1000, CFG) == 850.0       # 1000*0.85 > floor


# ── pricing ────────────────────────────────────────────────────────────────
def test_target_sell_price_uses_three_most_recent():
    comps = [comp(1000, 1), comp(2000, 2), comp(3000, 3), comp(99_999, 400)]
    # most recent three are 1000/2000/3000 -> avg 2000; the stale 99999 ignored
    assert target_sell_price(comps, CFG) == pytest.approx(2000.0)


def test_target_sell_price_requires_comps():
    with pytest.raises(ValueError):
        target_sell_price([], CFG)


# ── parts / outlier filtering ──────────────────────────────────────────────
def test_price_outlier_filter_drops_cheap_parts():
    # four ~$2000 units + one $200 part (e.g. a rotor) -> part dropped
    comps = [comp(2000, 1), comp(200, 2), comp(2100, 3), comp(1900, 4), comp(2000, 5)]
    kept = price_outlier_filter(comps, CFG)
    assert len(kept) == 4
    assert all(c.sold_price >= 800 for c in kept)  # 0.4 * median(2000) = 800


def test_price_outlier_filter_skips_small_comp_sets():
    # below comp_min_for_outlier_filter (4) the median isn't trustworthy -> untouched
    comps = [comp(2000, 1), comp(200, 2), comp(2000, 3)]
    assert len(price_outlier_filter(comps, CFG)) == 3


def test_target_sell_price_excludes_cheap_part_among_recent():
    # without filtering, the most-recent-3 includes the $200 part and tanks the avg
    comps = [comp(2000, 1), comp(200, 2), comp(2000, 3), comp(2100, 4), comp(1900, 5)]
    price = target_sell_price(comps, CFG)
    assert price == pytest.approx((2000 + 2000 + 2100) / 3, abs=1)  # part excluded
    assert price > 1900  # NOT the polluted ~1400


def test_drop_parts_excludes_flagged_comps():
    from src.comps import _drop_parts
    comps = [
        Comparable(sold_price=2000, is_part=False),
        Comparable(sold_price=995, is_part=True),    # control PCB
        Comparable(sold_price=1398, is_part=True),   # rotor
    ]
    kept = _drop_parts(comps)
    assert [c.sold_price for c in kept] == [2000]


# ── liquidity ──────────────────────────────────────────────────────────────
def test_liquidity_ok_when_fast():
    comps = [comp(2000, d) for d in (1, 3, 6, 10, 20)]  # 5 sales in 30d
    n, adv, days, ok = liquidity(comps, CFG, today=TODAY)
    assert n == 5
    assert adv == pytest.approx(5 / 30)
    assert days == pytest.approx(6.0)               # 30/5
    assert ok is True


def test_liquidity_drops_when_slow():
    comps = [comp(2000, 5)]  # only 1 sale in 30d -> 30 days to clear > 14
    n, adv, days, ok = liquidity(comps, CFG, today=TODAY)
    assert n == 1
    assert days == pytest.approx(30.0)
    assert ok is False


def test_liquidity_zero_sales_is_infinite():
    comps = [comp(2000, 200)]  # outside the 30d window
    n, adv, days, ok = liquidity(comps, CFG, today=TODAY)
    assert n == 0
    assert days == float("inf")
    assert ok is False


# ── end-to-end valuation ───────────────────────────────────────────────────
def test_evaluate_profitable_and_liquid_is_opportunity():
    comps = [comp(2000, d) for d in (1, 3, 6, 10, 20)]
    v = evaluate(ask_price=1000, comps=comps, cfg=CFG, today=TODAY)
    assert v.target_sell_price == 2000
    assert v.platform_fee == 60.0
    assert v.processing_fee == 60.0
    assert v.insurance_fee == 12.0
    assert v.freight_cost == 250
    assert v.total_cost == pytest.approx(1382.0)
    assert v.net_profit == pytest.approx(618.0)
    assert v.roi == pytest.approx(0.618, abs=1e-4)
    assert v.passes_roi is True
    assert v.liquidity_ok is True
    assert v.is_opportunity is True


def test_evaluate_thin_margin_is_not_opportunity():
    comps = [comp(2000, d) for d in (1, 3, 6, 10, 20)]
    v = evaluate(ask_price=1900, comps=comps, cfg=CFG, today=TODAY)
    assert v.net_profit < 0
    assert v.passes_roi is False
    assert v.is_opportunity is False


def test_evaluate_profitable_but_illiquid_is_rejected():
    # priced off 3 recent-looking comps, but only ONE actually within 30 days
    comps = [comp(2000, 5), comp(2000, 200), comp(2000, 250)]
    v = evaluate(ask_price=1000, comps=comps, cfg=CFG, today=TODAY)
    assert v.passes_roi is True            # the spread is great
    assert v.liquidity_ok is False         # but it won't move
    assert v.is_opportunity is False       # so it's dropped


def test_evaluate_rejects_nonpositive_ask():
    comps = [comp(2000, 1)]
    with pytest.raises(ValueError):
        evaluate(ask_price=0, comps=comps, cfg=CFG, today=TODAY)
