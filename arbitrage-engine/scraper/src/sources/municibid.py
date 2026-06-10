"""
Municibid — municipal & government surplus auctions (vehicles, equipment, machinery).
Modern JS site -> render + wait + scroll.
"""
from __future__ import annotations

from .base import ScrapflySource


class MunicibidSource(ScrapflySource):
    name = "municibid"
    site_label = "Municibid municipal-surplus auction"
    search_url = "https://municibid.com/listings?searchTerm={q}"
    base_url = "https://municibid.com"
    render_js = True
    rendering_wait = 7000
    auto_scroll = True
