"""
Claude-powered structured extraction: cleaned HTML -> a validated pydantic model.

This replaces multi-step browser-use agent navigation with a single, cheap, cached
Messages API call per page. We fetch HTML via Scrapfly (anti-bot) then hand it to
Claude with a strict output schema.

Design notes:
- Model defaults to `claude-sonnet-4-6` (config.ANTHROPIC_MODEL). Sonnet is the right
  pick for high-volume, low-complexity extraction; override via env if you want Opus.
- The stable extraction instructions live in a cached `system` block so repeated page
  calls within the cache TTL pay for the prompt prefix once.
- HTML is cleaned (scripts/styles stripped, links preserved) to keep token cost sane.
  If a page exceeds the char budget we log and slice — never silently drop content.
- `extract()` prefers the SDK's `messages.parse()` structured-output helper and falls
  back to a JSON-instruction prompt for older `anthropic` versions.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Type, TypeVar

from pydantic import BaseModel

from .config import secrets

log = logging.getLogger("arbitrage.llm")

T = TypeVar("T", bound=BaseModel)

_client = None

_EXTRACT_SYSTEM = (
    "You are a precise data-extraction engine for a secondhand-equipment resale "
    "arbitrage tool. You receive the cleaned text/HTML of a marketplace page. "
    "Extract ONLY information actually present on the page — never invent, guess, or "
    "fill in plausible values. Monetary amounts must be plain numbers in USD with no "
    "currency symbols or thousands separators (e.g. 4200.00). Dates must be ISO "
    "(YYYY-MM-DD). If a field is not present, omit it or set it null. Return data that "
    "strictly conforms to the requested schema and nothing else."
)


def _get_client():
    global _client
    if _client is None:
        import anthropic

        secrets.require("anthropic_api_key")
        _client = anthropic.Anthropic(api_key=secrets.anthropic_api_key)
    return _client


def clean_html(html: str, max_chars: int = 60_000) -> str:
    """
    Reduce raw page HTML to a compact, model-friendly representation: visible text
    plus a list of links (so listing ids / urls survive). Strips scripts, styles,
    and other non-content noise. Falls back to a regex strip if bs4 is unavailable.
    """
    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript", "svg", "head", "iframe", "link", "meta"]):
            tag.decompose()
        root = soup.body or soup
        text = root.get_text(" ", strip=True)
        links = []
        for a in root.find_all("a", href=True)[:300]:
            label = a.get_text(" ", strip=True)
            if label:
                links.append(f"{label} -> {a['href']}")
        cleaned = text + ("\n\nLINKS:\n" + "\n".join(links) if links else "")
    except Exception:  # bs4 missing or parse failure -> crude strip
        cleaned = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if len(cleaned) > max_chars:
        log.warning("cleaned page %d chars exceeds budget %d; slicing", len(cleaned), max_chars)
        cleaned = cleaned[:max_chars]
    return cleaned


def extract(html: str, instruction: str, schema: Type[T]) -> T:
    """Extract structured data matching `schema` from page `html`."""
    cleaned = clean_html(html)
    client = _get_client()
    system = [{"type": "text", "text": _EXTRACT_SYSTEM, "cache_control": {"type": "ephemeral"}}]
    user = f"{instruction}\n\n--- PAGE CONTENT ---\n{cleaned}"

    # Preferred: SDK structured-output helper (validates against the pydantic schema).
    try:
        resp = client.messages.parse(
            model=secrets.anthropic_model,
            max_tokens=8000,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=schema,
        )
        _log_cache(resp)
        return resp.parsed_output
    except (AttributeError, TypeError):
        pass  # older anthropic SDK without messages.parse -> fall through

    # Fallback: ask for JSON matching the schema, then validate ourselves.
    schema_json = json.dumps(schema.model_json_schema())
    resp = client.messages.create(
        model=secrets.anthropic_model,
        max_tokens=8000,
        system=system,
        messages=[
            {
                "role": "user",
                "content": (
                    f"{user}\n\nReturn ONLY a JSON object matching this JSON Schema "
                    f"(no prose, no markdown fences):\n{schema_json}"
                ),
            }
        ],
    )
    _log_cache(resp)
    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    return schema.model_validate_json(text)


def _log_cache(resp) -> None:
    u = getattr(resp, "usage", None)
    if u is not None:
        log.debug(
            "tokens in=%s out=%s cache_read=%s cache_write=%s",
            getattr(u, "input_tokens", "?"),
            getattr(u, "output_tokens", "?"),
            getattr(u, "cache_read_input_tokens", 0),
            getattr(u, "cache_creation_input_tokens", 0),
        )
