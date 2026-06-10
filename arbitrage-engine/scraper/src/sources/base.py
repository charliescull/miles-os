"""
Source abstraction.

A Source discovers candidate assets on ONE site and returns normalized
`ScrapedItem`s. It does NO valuation and NO DB writes — that's the orchestrator's
job (agent.py).

Most sources are the same shape: build a search URL, fetch it through Scrapfly,
hand the HTML to Claude with a discovery instruction, tag the source. That shared
flow lives in `ScrapflySource` so a new site is just a few lines of config:

    class FooSource(ScrapflySource):
        name = "foo"
        site_label = "Foo surplus auction"
        search_url = "https://foo.com/search?q={q}"
        base_url = "https://foo.com"
        render_js = True          # set for JS/SPA sites
        rendering_wait = 8000     # ms to wait for XHR-loaded results
        auto_scroll = True
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from urllib.parse import quote_plus

from pydantic import BaseModel

from ..llm import extract
from ..models import ScrapedItem
from ..proxy import scrapfly_fetch


class _DiscoverResult(BaseModel):
    """Schema Claude fills in from a search-results page."""
    items: list[ScrapedItem]


class Source(ABC):
    #: short stable key used on the CLI and stored on each row (e.g. "govdeals")
    name: str = "base"

    @abstractmethod
    def discover(self, query: str, limit: int = 25) -> list[ScrapedItem]:
        """Find up to `limit` candidate assets matching `query`."""
        raise NotImplementedError


class ScrapflySource(Source):
    """Base for sites scraped via Scrapfly fetch + Claude parse."""

    #: "https://site.com/search?q={q}" — {q} is URL-encoded
    search_url: str = ""
    #: human label injected into the extraction prompt
    site_label: str = ""
    #: used to absolutize relative listing URLs
    base_url: str = ""
    #: Scrapfly render settings — override per site
    render_js: bool = False
    rendering_wait: int = 0
    auto_scroll: bool = False

    def build_url(self, query: str) -> str:
        return self.search_url.format(q=quote_plus(query))

    def instruction(self, query: str, limit: int) -> str:
        rel = f" (prefix {self.base_url} if relative)" if self.base_url else ""
        return (
            f"This is a {self.site_label} search-results page for '{query}'. Extract up "
            f"to {limit} listings, preferring Business & Industrial equipment (commercial "
            "printing, heavy machinery, food-service, medical, lab). For each listing "
            "provide: title; source_listing_id (the site's listing/asset/auction id); "
            f"url (absolute{rel}); model_number and brand if identifiable from the title/"
            "description; condition; ask_price (current bid or buy-now, number USD); "
            "weight_lb if shown; location; category; ends_at (ISO datetime) if shown; "
            "image_url. Skip lots with no price or obvious junk. Return as `items`."
        )

    def discover(self, query: str, limit: int = 25) -> list[ScrapedItem]:
        url = self.build_url(query)
        html = scrapfly_fetch(
            url,
            render_js=self.render_js,
            rendering_wait=self.rendering_wait,
            auto_scroll=self.auto_scroll,
        )
        result = extract(html, self.instruction(query, limit), _DiscoverResult)
        for it in result.items:
            it.source = self.name  # force the source tag regardless of model output
            if self.base_url and it.url and it.url.startswith("/"):
                it.url = self.base_url.rstrip("/") + it.url
        return result.items[:limit]
