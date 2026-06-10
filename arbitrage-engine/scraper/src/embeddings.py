"""
OpenAI embeddings for pgvector semantic matching of equipment models. Used to
(a) store an embedding on each scraped_item and (b) detect near-duplicate models
via the `match_equipment` RPC. Optional: if OPENAI_API_KEY is unset, embed()
returns None and the pipeline degrades gracefully (no semantic dedupe).
"""
from __future__ import annotations

from .config import secrets

_client = None


def _get_client():
    global _client
    if _client is None:
        from openai import OpenAI

        _client = OpenAI(api_key=secrets.openai_api_key)
    return _client


def embed(text: str) -> list[float] | None:
    """Return a 1536-dim embedding for `text`, or None if embeddings are disabled."""
    if not secrets.openai_api_key:
        return None
    text = (text or "").strip()
    if not text:
        return None
    resp = _get_client().embeddings.create(model=secrets.embedding_model, input=text)
    return resp.data[0].embedding
