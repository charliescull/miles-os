"""
Thin wrapper around the browser-use Agent so the rest of the codebase has ONE
place that knows the (fast-moving) browser-use API surface. If browser-use changes
its structured-output hook between versions, this is the only file to touch.

Usage:
    items = await run_structured(task="...", schema=MyPydanticModel)
"""
from __future__ import annotations

import json
from typing import Type, TypeVar

from pydantic import BaseModel

from .config import secrets
from .proxy import make_browser

T = TypeVar("T", bound=BaseModel)


def _llm():
    """Claude as the agent's brain (per the spec)."""
    from browser_use import ChatAnthropic

    secrets.require("anthropic_api_key")
    return ChatAnthropic(model=secrets.anthropic_model)


async def run_structured(task: str, schema: Type[T]) -> T:
    """
    Run a browser-use Agent for `task` and coerce its final result into `schema`.

    We ask browser-use for structured output via `output_model_schema` (supported
    in current versions). We also defensively JSON-parse the final text in case a
    given version returns a string — making this resilient to minor API drift.
    """
    from browser_use import Agent

    browser = make_browser()
    agent = Agent(
        task=task,
        llm=_llm(),
        browser=browser,
        output_model_schema=schema,
    )
    history = await agent.run()

    # Preferred path: browser-use already validated against the schema.
    structured = getattr(history, "structured_output", None)
    if isinstance(structured, schema):
        return structured

    # Fallbacks for version drift.
    final = history.final_result() if hasattr(history, "final_result") else str(history)
    if isinstance(final, schema):
        return final
    if isinstance(final, dict):
        return schema.model_validate(final)
    if isinstance(final, str):
        return schema.model_validate(json.loads(final))
    raise RuntimeError(f"Could not coerce agent output into {schema.__name__}: {final!r}")
