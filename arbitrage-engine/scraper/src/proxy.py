"""
Scrapfly fetching — anti-bot HTML retrieval through residential proxies.

Uses Scrapfly's REST API directly via `requests` (verified response shape) rather
than the SDK, so there's no ambiguity about attribute names. Each residential+ASP
request costs ~25 Scrapfly credits (+ more with render_js), so callers pass
`render_js` only when a page genuinely needs JS.
"""
from __future__ import annotations

import logging
import os

from .config import secrets

log = logging.getLogger("arbitrage.proxy")

_SCRAPFLY_ENDPOINT = "https://api.scrapfly.io/scrape"


def scrapfly_fetch(url: str, render_js: bool = False, country: str = "US", asp: bool = True,
                   timeout: int = 180, rendering_wait: int = 0, wait_for_selector: str | None = None,
                   auto_scroll: bool = False) -> str:
    """
    Fetch `url` through Scrapfly and return the page HTML.

    render_js=True spins up a real browser (needed for JS-rendered pages; costs more
    credits). asp=True enables anti-scraping-protection. Proxy pool is configurable
    via SCRAPFLY_PROXY_POOL (default residential).

    For client-side-rendered pages (results loaded via XHR after paint), pass
    rendering_wait (ms to wait after load), wait_for_selector (CSS to wait for), and/or
    auto_scroll=True (trigger lazy-loaded content). These require render_js=True.
    """
    secrets.require("scrapfly_key")
    import requests

    params = {
        "key": secrets.scrapfly_key,
        "url": url,
        "asp": "true" if asp else "false",
        "render_js": "true" if render_js else "false",
        "country": country,
        "proxy_pool": os.getenv("SCRAPFLY_PROXY_POOL", "public_residential_pool"),
        "retry": "true",
    }
    if render_js:
        if rendering_wait:
            params["rendering_wait"] = str(rendering_wait)
        if wait_for_selector:
            params["wait_for_selector"] = wait_for_selector
        if auto_scroll:
            params["auto_scroll"] = "true"
    resp = requests.get(_SCRAPFLY_ENDPOINT, params=params, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    result = data.get("result", {}) or {}
    cost = (data.get("context", {}) or {}).get("cost", {})
    log.info("scrapfly %s -> upstream %s (cost %s credits)", url, result.get("status_code"),
             cost.get("total") if isinstance(cost, dict) else cost)

    content = result.get("content")
    if not content:
        raise RuntimeError(
            f"Scrapfly returned no content for {url} "
            f"(status={result.get('status_code')}, success={result.get('success')})"
        )
    return content


def make_browser():
    """
    OPTIONAL local/cloud browser via browser-use, for sites that need true agentic
    interaction. Not on the default Scrapfly path, so browser-use need not be
    installed unless you opt into the browser engine. Imported lazily.
    """
    from browser_use import Browser

    if secrets.use_browser_cloud:
        return Browser(use_cloud=True)
    return Browser()
