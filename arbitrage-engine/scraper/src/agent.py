"""
ORCHESTRATOR — ties the pipeline together for one source + query (synchronous):

    discover items  ->  for each item:
        embed + upsert scraped_item
        fetch eBay sold comps
        evaluate() the landed-cost math + liquidity
        if it's an opportunity -> upsert opportunity (dashboard sees it live)
        else -> mark scraped_item rejected with a reason

Network/DB live here; the math stays pure in calc.py. Returns a run summary.
"""
from __future__ import annotations

import logging

from . import calc, supabase_client as db
from .comps import fetch_comps
from .config import strategy
from .embeddings import embed
from .models import ScrapedItem
from .query import build_comp_query
from .sources import SOURCES

log = logging.getLogger("arbitrage.agent")


def process_item(item: ScrapedItem) -> dict:
    """Validate + value a single discovered asset. Returns a per-item result dict."""
    # 1. Persist the raw find (with embedding for semantic dedupe), get its id.
    vector = embed(f"{item.title} {item.model_number or ''} {item.brand or ''}".strip())
    item_id = db.upsert_scraped_item(item, embedding=vector)

    # 2. Market validation — search eBay sold comps with a cleaned brand+type+model query.
    query = build_comp_query(item)
    log.info("comp query for %r -> %r", item.title[:40], query)
    comps = fetch_comps(query, condition=item.condition)
    if not comps:
        db.set_item_status(item_id, "rejected", "no eBay sold comps found")
        return {"item": item.title, "status": "rejected", "reason": "no comps"}
    db.insert_comparables(item_id, comps)

    # 3. The math (pure, tested).
    valuation = calc.evaluate(item.ask_price, comps, weight_lb=item.weight_lb)

    # 4. Trigger.
    if not valuation.is_opportunity:
        reason = (
            f"roi {valuation.roi:.2%} <= {strategy.roi_threshold:.0%}"
            if not valuation.passes_roi
            else f"illiquid: ~{valuation.est_days_to_liquidate}d > {strategy.max_days_to_liquidate}d"
        )
        db.set_item_status(item_id, "rejected", reason)
        return {"item": item.title, "status": "rejected", "reason": reason}

    opp_id = db.upsert_opportunity(item, valuation, comps, scraped_item_id=item_id)
    db.set_item_status(item_id, "opportunity")
    log.info("OPPORTUNITY %s | ROI %.1f%% | net $%.0f", item.title,
             valuation.roi * 100, valuation.net_profit)

    # Self-learning: snapshot features + score with the active model (best-effort —
    # needs migration 0002_ml.sql; a cold start falls back to deterministic net profit).
    try:
        from .ml.score import score_row
        feats, score, conf = score_row({
            "ask_price": item.ask_price, "target_sell_price": valuation.target_sell_price,
            "net_profit": valuation.net_profit, "roi": valuation.roi,
            "total_cost": valuation.total_cost, "freight_cost": valuation.freight_cost,
            "platform_fee": valuation.platform_fee, "processing_fee": valuation.processing_fee,
            "insurance_fee": valuation.insurance_fee, "sold_count_30d": valuation.sold_count_30d,
            "adv": valuation.adv, "est_days_to_liquidate": valuation.est_days_to_liquidate,
            "condition": item.condition, "brand": item.brand, "model_number": item.model_number,
            "source": item.source, "comps": [{"sold_price": c.sold_price} for c in comps],
        })
        db.update_opportunity_score(opp_id, feats, score, conf)
        log.info("model score: $%.0f (confidence %.2f)", score, conf)
    except Exception as exc:
        log.warning("scoring skipped (%s) — apply db/0002_ml.sql to enable", exc)
    return {
        "item": item.title,
        "status": "opportunity",
        "roi": valuation.roi,
        "net_profit": valuation.net_profit,
    }


def run_source(source_name: str, query: str, limit: int = 25) -> dict:
    """Discover + process every candidate from one source. Returns a run summary."""
    if source_name not in SOURCES:
        raise ValueError(f"Unknown source '{source_name}'. Known: {list(SOURCES)}")

    source = SOURCES[source_name]()
    log.info("Discovering on %s for %r ...", source_name, query)
    items = source.discover(query, limit=limit)
    log.info("Discovered %d candidate(s)", len(items))

    results = []
    for item in items:
        try:
            results.append(process_item(item))
        except Exception as exc:  # one bad listing must not kill the whole run
            log.exception("Failed processing %s", item.title)
            results.append({"item": item.title, "status": "error", "reason": str(exc)})

    opportunities = [r for r in results if r["status"] == "opportunity"]
    return {
        "source": source_name,
        "query": query,
        "discovered": len(items),
        "opportunities": len(opportunities),
        "results": results,
    }
