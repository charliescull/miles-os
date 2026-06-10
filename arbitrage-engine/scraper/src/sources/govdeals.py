"""GovDeals — government surplus auctions (Liquidity Services). Akamai-protected SPA."""
from __future__ import annotations

from .base import ScrapflySource


class GovDealsSource(ScrapflySource):
    name = "govdeals"
    site_label = "GovDeals government-surplus auction"
    search_url = "https://www.govdeals.com/search?q={q}"
    base_url = "https://www.govdeals.com"
    # Results load via XHR after paint -> render + wait + scroll (verified 2026-06-07).
    render_js = True
    rendering_wait = 8000
    auto_scroll = True
