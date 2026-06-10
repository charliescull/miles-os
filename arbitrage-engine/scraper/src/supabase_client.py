"""
Supabase persistence layer. Uses the SERVICE-ROLE key (bypasses RLS) and is the
ONLY module that writes to the database. Everything is upsert-on-conflict so
re-running the scraper is idempotent and never creates duplicate rows.
"""
from __future__ import annotations

import json
from typing import Optional

from .config import secrets
from .models import Comparable, Opportunity, ScrapedItem, Valuation

_client = None


def get_client():
    """Lazily create the Supabase client so importing this module needs no creds."""
    global _client
    if _client is None:
        from supabase import create_client

        secrets.require("supabase_url", "supabase_key")
        _client = create_client(secrets.supabase_url, secrets.supabase_key)
    return _client


# ── scraped_items ──────────────────────────────────────────────────────────
def upsert_scraped_item(item: ScrapedItem, embedding: Optional[list[float]] = None) -> str:
    """
    Insert/update a scraped item (dedupe key = source + source_listing_id).
    Returns the row id.
    """
    payload = {
        "source": item.source,
        "source_listing_id": item.source_listing_id,
        "url": item.url,
        "title": item.title,
        "model_number": item.model_number,
        "brand": item.brand,
        "condition": item.condition,
        "ask_price": item.ask_price,
        "currency": item.currency,
        "weight_lb": item.weight_lb,
        "location": item.location,
        "category": item.category,
        "ends_at": item.ends_at.isoformat() if item.ends_at else None,
        "raw": item.raw,
    }
    if embedding is not None:
        payload["embedding"] = embedding

    res = (
        get_client()
        .table("scraped_items")
        .upsert(payload, on_conflict="source,source_listing_id")
        .execute()
    )
    return res.data[0]["id"]


def set_item_status(item_id: str, status: str, reject_reason: str | None = None) -> None:
    get_client().table("scraped_items").update(
        {"status": status, "reject_reason": reject_reason}
    ).eq("id", item_id).execute()


# ── market_comparables ─────────────────────────────────────────────────────
def insert_comparables(scraped_item_id: str, comps: list[Comparable]) -> None:
    if not comps:
        return
    rows = [
        {
            "scraped_item_id": scraped_item_id,
            "ebay_item_id": c.ebay_item_id,
            "title": c.title,
            "sold_price": c.sold_price,
            "shipping_price": c.shipping_price,
            "sold_date": c.sold_date.isoformat() if c.sold_date else None,
            "condition": c.condition,
            "url": c.url,
            "similarity": c.similarity,
        }
        for c in comps
    ]
    get_client().table("market_comparables").insert(rows).execute()


# ── opportunities ──────────────────────────────────────────────────────────
def upsert_opportunity(
    item: ScrapedItem,
    valuation: Valuation,
    comps: list[Comparable],
    scraped_item_id: str,
) -> str:
    """Push a qualifying deal. Dedupe key = scraped_item_id (one opp per item)."""
    opp = Opportunity(
        scraped_item_id=scraped_item_id,
        title=item.title,
        source=item.source,
        source_url=item.url,
        model_number=item.model_number,
        brand=item.brand,
        condition=item.condition,
        image_url=item.image_url,
        ask_price=valuation.ask_price,
        target_sell_price=valuation.target_sell_price,
        freight_cost=valuation.freight_cost,
        platform_fee=valuation.platform_fee,
        processing_fee=valuation.processing_fee,
        insurance_fee=valuation.insurance_fee,
        total_cost=valuation.total_cost,
        net_profit=valuation.net_profit,
        roi=valuation.roi,
        sold_count_30d=valuation.sold_count_30d,
        adv=valuation.adv,
        est_days_to_liquidate=(
            valuation.est_days_to_liquidate
            if valuation.est_days_to_liquidate != float("inf")
            else 9999
        ),
        liquidity_ok=valuation.liquidity_ok,
        comps=[json.loads(c.model_dump_json()) for c in comps],
    )
    payload = json.loads(opp.model_dump_json())
    res = (
        get_client()
        .table("opportunities")
        .upsert(payload, on_conflict="scraped_item_id")
        .execute()
    )
    return res.data[0]["id"]


# ── ML: model persistence + outcome labels (migration 0002_ml.sql) ────────
def update_opportunity_score(opp_id: str, features: dict, score: float, confidence: float) -> None:
    """Write the model's feature snapshot + predicted realized profit onto an opp."""
    get_client().table("opportunities").update(
        {"features": features, "model_score": score, "model_confidence": confidence}
    ).eq("id", opp_id).execute()


def fetch_active_model() -> dict | None:
    res = (
        get_client().table("ml_model").select("*")
        .eq("is_active", True).order("created_at", desc=True).limit(1).execute()
    )
    return res.data[0] if res.data else None


def fetch_labeled_opportunities() -> list[dict]:
    """Opportunities with a human decision — the training labels."""
    res = (
        get_client().table("opportunities").select("*")
        .in_("decision", ["bought", "passed"]).execute()
    )
    return res.data or []


def save_model(feature_names: list[str], params: dict, metrics: dict, n_samples: int) -> None:
    """Deactivate the previous model and store + activate the freshly trained one."""
    c = get_client()
    c.table("ml_model").update({"is_active": False}).eq("is_active", True).execute()
    c.table("ml_model").insert({
        "kind": "ridge_profit", "feature_names": feature_names, "params": params,
        "metrics": metrics, "n_samples": n_samples, "is_active": True,
    }).execute()
