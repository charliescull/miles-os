"""
Entry point for the scraper worker.

  Single pass (default — recommended while testing + for cron jobs):
      python run.py --source govdeals --query "commercial printer" --limit 3

  Continuous loop (only with a paid Scrapfly plan — residential+ASP ≈ 25 credits/req):
      python run.py --interval 7200 --source govdeals --query "commercial printer,cnc"

`--query` accepts a comma-separated list; each is run in turn. Default behavior is a
single pass (no flag needed) so you never accidentally burn the Scrapfly free tier.
"""
from __future__ import annotations

import argparse
import json
import logging
import time

from src.agent import run_source

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
log = logging.getLogger("arbitrage.run")


def _one_pass(source: str, queries: list[str], limit: int) -> None:
    for q in queries:
        summary = run_source(source, q.strip(), limit=limit)
        log.info(
            "Pass done: %s/%r -> %d/%d opportunities",
            source, q, summary["opportunities"], summary["discovered"],
        )
        log.debug(json.dumps(summary, indent=2, default=str))


def main() -> None:
    p = argparse.ArgumentParser(description="Arbitrage Engine scraper worker")
    p.add_argument("--source", default="govdeals", help="source key (see src/sources)")
    p.add_argument("--query", required=True, help="comma-separated search terms")
    p.add_argument("--limit", type=int, default=5, help="max candidates per query")
    p.add_argument("--interval", type=int, default=0,
                   help="seconds between passes; 0 = single pass then exit (default)")
    args = p.parse_args()

    queries = [q for q in args.query.split(",") if q.strip()]

    # Default: single pass. Loop ONLY if an explicit positive --interval is given.
    if not args.interval or args.interval <= 0:
        _one_pass(args.source, queries, args.limit)
        return

    log.info("Loop mode: every %ds over %d query/queries", args.interval, len(queries))
    while True:
        try:
            _one_pass(args.source, queries, args.limit)
        except Exception:
            log.exception("Pass failed; continuing after interval")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
