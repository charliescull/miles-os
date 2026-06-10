"""
GovPlanet — Ritchie Bros marketplace for government/military heavy equipment, trucks,
and industrial assets. JS-driven search -> render + wait.
"""
from __future__ import annotations

from .base import ScrapflySource


class GovPlanetSource(ScrapflySource):
    name = "govplanet"
    site_label = "GovPlanet heavy-equipment / surplus auction"
    search_url = "https://www.govplanet.com/c/search?keywords={q}"
    base_url = "https://www.govplanet.com"
    render_js = True
    rendering_wait = 7000
    auto_scroll = True
