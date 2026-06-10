"""
Sourcing adapters. Each source discovers candidate industrial assets and yields
normalized `ScrapedItem`s. Register new sources in the SOURCES registry below; the
CLI (`run.py --source <name>`) and orchestrator look them up here.

To add a site: subclass `ScrapflySource` (see base.py) with a name + search_url +
render settings, then add it to SOURCES. That's it.

Live-verification status (as of 2026-06-07):
  - govdeals      ✅ verified live (render_js + rendering_wait + auto_scroll)
  - publicsurplus ✅ verified live (static; needs posting=y&keyWord=&Submit4=Search)
  - allsurplus    ⚠ scaffolded — search_url/render settings best-effort, verify live
  - govplanet     ⚠ scaffolded — search_url/render settings best-effort, verify live
  - municibid     ⚠ scaffolded — search_url/render settings best-effort, verify live
The ⚠ sources will likely need the same kind of URL tuning publicsurplus needed
(find the param that actually executes the search) on their first live run.
"""
from __future__ import annotations

from .allsurplus import AllSurplusSource
from .base import ScrapflySource, Source
from .govdeals import GovDealsSource
from .govplanet import GovPlanetSource
from .municibid import MunicibidSource
from .publicsurplus import PublicSurplusSource

# name -> Source class
SOURCES: dict[str, type[Source]] = {
    s.name: s
    for s in (
        GovDealsSource,
        PublicSurplusSource,
        AllSurplusSource,
        GovPlanetSource,
        MunicibidSource,
    )
}

__all__ = ["Source", "ScrapflySource", "SOURCES"]
