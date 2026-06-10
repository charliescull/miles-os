"""
eBay comp-search query construction.

The comp lookup is only as good as the search string. Raw source titles are noisy
("ONE LEBLOND REGAL LATHE - SOLD AS IS - 671") and bare internal model codes
("MR-25-3") match nothing on eBay. `build_comp_query` produces a clean,
eBay-friendly query: brand + product type + real model, with lot numbers and
auction filler stripped out.

Pure + deterministic -> unit tested in tests/test_query.py.
"""
from __future__ import annotations

import re

from .models import ScrapedItem

# Auction/listing filler that hurts an eBay match. Whole-word, case-insensitive.
_NOISE = re.compile(
    r"\b(sold\s+as\s+is|as[-\s]?is|no\s+reserve|for\s+parts(?:\s+or\s+repair)?|"
    r"parts\s+only|not\s+working|in\s+working\s+order|working|tested|untested|"
    r"surplus|govt?|government|lot\s*#?\s*\d*|qty\s*\d+|quantity|each|"
    r"one|two|three|used|pre[-\s]?owned|new)\b",
    re.I,
)
_SEP = re.compile(r"[~|/\\>•·]+")              # separators -> space
_TRAIL_LOT = re.compile(r"[-–—]\s*#?\s*\d{2,}\s*$")  # trailing "- 671" lot number
_HASH_LOT = re.compile(r"#\s*\d+")            # "#671"
_MULTISPACE = re.compile(r"\s+")
_MAX_WORDS = 9


def _clean(text: str) -> str:
    t = _SEP.sub(" ", text or "")
    t = _NOISE.sub(" ", t)
    t = _HASH_LOT.sub(" ", t)
    t = _TRAIL_LOT.sub(" ", t)
    t = _MULTISPACE.sub(" ", t).strip(" -–—~|,.")
    return t


def build_comp_query(item: ScrapedItem) -> str:
    """
    Compose an eBay sold-comp search string from a scraped item.

    Strategy: clean the title (it carries the product *type*, e.g. "BRAKE LATHE"),
    then make sure the brand leads and the model is present — both are strong eBay
    signals. Falls back to model/title if cleaning empties the string.
    """
    base = _clean(item.title)
    q = base

    brand = (item.brand or "").strip()
    if brand and brand.lower() not in q.lower():
        q = f"{brand} {q}".strip()

    model = (item.model_number or "").strip()
    if model and model.lower() not in q.lower():
        q = f"{q} {model}".strip()

    q = _MULTISPACE.sub(" ", q).strip()
    if len(q) < 3:  # cleaning nuked everything -> fall back
        q = (item.model_number or item.title or "").strip()

    return " ".join(q.split()[:_MAX_WORDS])
