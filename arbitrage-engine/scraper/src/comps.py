"""
Market validation: fetch eBay SOLD/COMPLETED comparables for an item.

PLUGGABLE BY DESIGN. eBay's Marketplace Insights API (the "right" way to get sold
comps) is gated to approved partners and refused to most developers, so the default
backend Scrapfly-fetches eBay's sold-listings search page and has Claude parse it.
If/when you get Marketplace Insights access, implement `_fetch_via_api` and set
COMPS_BACKEND=api.

eBay sold-search pages are server-rendered, so render_js stays off (cheaper credits).
"""
from __future__ import annotations

import logging
import os
from urllib.parse import quote_plus

from pydantic import BaseModel

from .llm import extract
from .models import Comparable
from .proxy import scrapfly_fetch

log = logging.getLogger("arbitrage.comps")


class _CompsResult(BaseModel):
    comparables: list[Comparable]


def _drop_parts(comps: list[Comparable]) -> list[Comparable]:
    """Keep only complete-unit comps; parts/accessories pollute pricing + liquidity."""
    units = [c for c in comps if not c.is_part]
    dropped = len(comps) - len(units)
    if dropped:
        log.info("dropped %d part/accessory comp(s); %d unit comp(s) remain", dropped, len(units))
    return units


def _ebay_sold_url(query: str) -> str:
    """eBay search filtered to Sold + Completed, sorted most-recently-ended first."""
    return (
        f"https://www.ebay.com/sch/i.html?_nkw={quote_plus(query)}"
        f"&LH_Sold=1&LH_Complete=1&_sop=13"
    )


def _fetch_via_scrapfly(query: str, condition: str | None, limit: int) -> list[Comparable]:
    html = scrapfly_fetch(_ebay_sold_url(query), render_js=False)
    instruction = (
        f"This is an eBay SOLD/COMPLETED listings search page for '{query}'"
        + (f" (condition: {condition})." if condition else ".")
        + f" Extract up to {limit} of the most recent genuinely SOLD listings that "
        "match this equipment as a COMPLETE, STANDALONE unit. For each: title; "
        "sold_price (number USD); shipping_price if shown; sold_date (ISO, from the "
        "'Sold' date label); condition; url; ebay_item_id from the url if present; and "
        "is_part. Set is_part=true when the listing is NOT a whole working/as-is unit — "
        "i.e. a component or accessory such as a rotor, bucket, lid, door, control "
        "board/PCB, motor, display, power supply, manual, bracket, adapter, rotor set, "
        "or anything titled 'for parts', 'parts only', 'repair', or 'rotor/board/etc. "
        "for <model>'. Set is_part=false only for a complete unit of the same model. "
        "Include both kinds (flagged) but exclude clearly unrelated items. Return as "
        "`comparables`."
    )
    result = extract(html, instruction, _CompsResult)
    return _drop_parts(result.comparables)[:limit]


def _fetch_via_api(query: str, condition: str | None, limit: int) -> list[Comparable]:
    """eBay Marketplace Insights API path — implement once partner access is granted."""
    raise NotImplementedError(
        "Marketplace Insights API access is partner-gated. Use COMPS_BACKEND=scrapfly "
        "until approved, then implement this with the item_sales/search endpoint."
    )


def fetch_comps(query: str, condition: str | None = None, limit: int = 12) -> list[Comparable]:
    """Return up to `limit` recent eBay sold comps. Backend via COMPS_BACKEND env."""
    backend = os.getenv("COMPS_BACKEND", "scrapfly").lower()
    if backend == "api":
        return _fetch_via_api(query, condition, limit)
    return _fetch_via_scrapfly(query, condition, limit)
