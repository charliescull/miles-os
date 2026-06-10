"""
AllSurplus — Liquidity Services' B2B surplus marketplace (same parent as GovDeals).
Heavy on industrial / fleet / equipment lots. Modern SPA -> render + wait + scroll.
"""
from __future__ import annotations

from .base import ScrapflySource


class AllSurplusSource(ScrapflySource):
    name = "allsurplus"
    site_label = "AllSurplus B2B industrial-surplus marketplace"
    search_url = "https://www.allsurplus.com/search?q={q}"
    base_url = "https://www.allsurplus.com"
    render_js = True
    rendering_wait = 8000
    auto_scroll = True
