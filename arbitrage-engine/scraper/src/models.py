"""
Pydantic data models — the typed contracts that flow through the pipeline:

    ScrapedItem  --(+ comps)-->  Valuation  --(if it passes)-->  Opportunity

Keeping these strict means a malformed scrape fails fast at the boundary rather
than silently inserting garbage into Supabase.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator


class ScrapedItem(BaseModel):
    """An asset as discovered on a source site, before any validation."""

    source: str
    source_listing_id: Optional[str] = None
    url: str
    title: str
    model_number: Optional[str] = None
    brand: Optional[str] = None
    condition: Optional[str] = None
    ask_price: float = Field(..., gt=0, description="Current ask / current bid in USD")
    currency: str = "USD"
    weight_lb: Optional[float] = Field(default=None, gt=0)
    location: Optional[str] = None
    category: Optional[str] = None
    ends_at: Optional[datetime] = None
    image_url: Optional[str] = None
    raw: dict = Field(default_factory=dict)

    @field_validator("title")
    @classmethod
    def _title_nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("title is required")
        return v.strip()


class Comparable(BaseModel):
    """One eBay sold/completed listing used as a price comp."""

    ebay_item_id: Optional[str] = None
    title: Optional[str] = None
    sold_price: float = Field(..., gt=0)
    shipping_price: Optional[float] = None
    sold_date: Optional[date] = None
    condition: Optional[str] = None
    url: Optional[str] = None
    similarity: Optional[float] = Field(default=None, ge=0, le=1)
    # True when the listing is a PART / accessory / "for parts" rather than a complete,
    # standalone unit of the equipment. Such comps are excluded from pricing + liquidity.
    is_part: bool = False


class Valuation(BaseModel):
    """Full landed-cost + ROI + liquidity breakdown for one item. The math output."""

    ask_price: float
    target_sell_price: float
    freight_cost: float
    platform_fee: float
    processing_fee: float
    insurance_fee: float
    total_cost: float
    net_profit: float
    roi: float

    sold_count_30d: int
    adv: float
    est_days_to_liquidate: float
    liquidity_ok: bool

    passes_roi: bool
    is_opportunity: bool  # passes_roi AND liquidity_ok


class Opportunity(BaseModel):
    """The denormalized row pushed to Supabase `opportunities`."""

    scraped_item_id: Optional[str] = None
    title: str
    source: str
    source_url: str
    model_number: Optional[str] = None
    brand: Optional[str] = None
    condition: Optional[str] = None
    image_url: Optional[str] = None

    ask_price: float
    target_sell_price: float
    freight_cost: float
    platform_fee: float
    processing_fee: float
    insurance_fee: float
    total_cost: float
    net_profit: float
    roi: float

    sold_count_30d: int
    adv: float
    est_days_to_liquidate: float
    liquidity_ok: bool

    comps: list[dict] = Field(default_factory=list)
    status: str = "new"
