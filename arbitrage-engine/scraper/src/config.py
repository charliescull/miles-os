"""
Central configuration. Every tunable lives here and is sourced from the
environment (see ../.env.example). Nothing downstream should hardcode a rate or
threshold — import from `settings` instead.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


def _f(key: str, default: float) -> float:
    """Float env var with a default."""
    raw = os.getenv(key)
    return float(raw) if raw not in (None, "") else default


def _i(key: str, default: int) -> int:
    raw = os.getenv(key)
    return int(raw) if raw not in (None, "") else default


@dataclass(frozen=True)
class StrategyConfig:
    """All numbers that define the arbitrage strategy. Defaults match the spec."""

    roi_threshold: float = field(default_factory=lambda: _f("ROI_THRESHOLD", 0.25))
    max_days_to_liquidate: float = field(default_factory=lambda: _f("MAX_DAYS_TO_LIQUIDATE", 14))

    freight_flat_usd: float = field(default_factory=lambda: _f("FREIGHT_FLAT_USD", 250))
    processing_rate: float = field(default_factory=lambda: _f("PROCESSING_RATE", 0.03))
    insurance_rate: float = field(default_factory=lambda: _f("INSURANCE_RATE", 0.006))
    insurance_base: str = field(default_factory=lambda: os.getenv("INSURANCE_BASE", "sell"))

    # eBay Business & Industrial tiered final-value fee
    fee_tier1_rate: float = field(default_factory=lambda: _f("FEE_TIER1_RATE", 0.03))
    fee_tier2_rate: float = field(default_factory=lambda: _f("FEE_TIER2_RATE", 0.005))
    fee_breakpoint_usd: float = field(default_factory=lambda: _f("FEE_BREAKPOINT_USD", 15000))

    comps_lookback_days: int = field(default_factory=lambda: _i("COMPS_LOOKBACK_DAYS", 30))
    comps_for_price: int = field(default_factory=lambda: _i("COMPS_FOR_PRICE", 3))

    # Parts/outlier guard: when there are at least N comps, drop any whose sold_price is
    # below (floor_ratio * median) before pricing — a backstop for parts/accessories
    # that slipped past the semantic is_part filter and would drag the average down.
    comp_outlier_floor_ratio: float = field(default_factory=lambda: _f("COMP_OUTLIER_FLOOR_RATIO", 0.4))
    comp_min_for_outlier_filter: int = field(default_factory=lambda: _i("COMP_MIN_FOR_OUTLIER_FILTER", 4))


@dataclass(frozen=True)
class Secrets:
    """API credentials. Validated lazily so the math/tests run without them."""

    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    anthropic_model: str = field(default_factory=lambda: os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"))
    supabase_url: str = field(default_factory=lambda: os.getenv("SUPABASE_URL", ""))
    supabase_key: str = field(default_factory=lambda: os.getenv("SUPABASE_KEY", ""))
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    embedding_model: str = field(default_factory=lambda: os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"))
    scrapfly_key: str = field(default_factory=lambda: os.getenv("SCRAPFLY_KEY", ""))
    use_browser_cloud: bool = field(default_factory=lambda: os.getenv("USE_BROWSER_CLOUD", "0") == "1")
    browser_use_api_key: str = field(default_factory=lambda: os.getenv("BROWSER_USE_API_KEY", ""))

    def require(self, *names: str) -> None:
        """Raise if any named secret is empty. Call right before you need it."""
        missing = [n for n in names if not getattr(self, n)]
        if missing:
            raise RuntimeError(
                f"Missing required env: {', '.join(missing).upper()}. "
                f"Copy ../.env.example to .env and fill it in."
            )


strategy = StrategyConfig()
secrets = Secrets()
