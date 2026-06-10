"""
PublicSurplus — government/municipal surplus auctions. Older server-rendered ASP.NET
site, so results are usually in the initial HTML (no render_js needed = cheaper).
"""
from __future__ import annotations

from .base import ScrapflySource


class PublicSurplusSource(ScrapflySource):
    name = "publicsurplus"
    site_label = "PublicSurplus government-surplus auction"
    # Search executes via GET /sms/browse/search with posting=y + keyWord + Submit4
    # (posting=y is what actually runs the search vs. showing the empty form).
    search_url = "https://www.publicsurplus.com/sms/browse/search?posting=y&keyWord={q}&Submit4=Search"
    base_url = "https://www.publicsurplus.com"
    render_js = False  # server-rendered; flip to True if results come back empty
