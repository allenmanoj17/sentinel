import json
import os
import re
from typing import Any

from dotenv import load_dotenv

load_dotenv()

WATCH_QUERY_DELIMITER = "\n::query::\n"
URL_PATTERN = re.compile(r"https?://[^\s,]+", re.IGNORECASE)

def unpack_watch_topic(stored_topic: str) -> tuple[str, str]:
    if not stored_topic:
        return "", ""
    if WATCH_QUERY_DELIMITER not in stored_topic:
        return stored_topic, stored_topic
    display_name, search_query = stored_topic.split(WATCH_QUERY_DELIMITER, 1)
    return display_name.strip(), search_query.strip()


def pack_watch_topic(display_name: str, search_query: str) -> str:
    clean_name = (display_name or search_query or "Untitled watch").strip()
    clean_query = (search_query or display_name or clean_name).strip()
    if clean_name == clean_query:
        return clean_name
    return f"{clean_name}{WATCH_QUERY_DELIMITER}{clean_query}"


def serialize_sources(sources: list[dict[str, str]]) -> str:
    return json.dumps(sources)


def normalize_sources(sources: Any) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []

    if not sources:
        return normalized

    if isinstance(sources, str):
        try:
            sources = json.loads(sources)
        except json.JSONDecodeError:
            sources = [sources]

    if isinstance(sources, list):
        for item in sources:
            if isinstance(item, str):
                if item.strip():
                    normalized.append({"name": item.strip(), "url": ""})
            elif isinstance(item, dict):
                name = str(item.get("name", "")).strip()
                url = str(item.get("url", "")).strip()
                if name:
                    normalized.append({"name": name, "url": url})

    return normalized


CONSOLIDATE_PROMPT = """You turn a watch creation form into:
1. a short display name for humans
2. a concise Firecrawl search query for monitoring

Return valid JSON only:
{
  "watch_name": "<2-6 words, human readable>",
  "search_query": "<concise monitoring query for Firecrawl>"
}

Rules:
- Preserve the user’s subject exactly when possible.
- If the form includes an explicit watch_name, use it as the display name unless it is empty or clearly unusable.
- The watch name should be clean enough for a dashboard card.
- The search query should include the watch target plus the change types / impact hints that matter.
- Keep the search query concise and web-search oriented, not a paragraph.
- If source_urls are present, include those exact URLs in the monitoring query.
- If official sources are required, reflect that in the query.
- If extra_information is present, use it to sharpen the query without bloating it.
- Do not invent companies, products, or details not present in the form.

FORM:
{payload}
"""


def fallback_watch_config(payload: dict[str, Any]) -> dict[str, str]:
    subject = str(payload.get("topic", "")).strip() or "Untitled watch"
    explicit_name = str(payload.get("watch_name", "")).strip()
    watch_type = str(payload.get("watch_type", "")).strip()
    extra_information = str(payload.get("extra_information", "")).strip()
    source_urls = payload.get("source_urls") or []
    watch_name = explicit_name or (f"{subject} {watch_type}".strip() if watch_type else subject)

    parts = [subject]
    for key in ("watch_type",):
        value = str(payload.get(key, "")).strip()
        if value:
            parts.append(value)

    for key in ("change_types", "impact_types"):
        values = payload.get(key) or []
        if isinstance(values, list):
            cleaned = [str(v).strip() for v in values if str(v).strip()]
            if cleaned:
                parts.append(", ".join(cleaned))

    if payload.get("official_sources_only"):
        parts.append("official sources")
    if extra_information:
        parts.append(extra_information)
    if isinstance(source_urls, list):
        cleaned_urls = [str(url).strip() for url in source_urls if str(url).strip()]
        if cleaned_urls:
            parts.append("urls: " + ", ".join(cleaned_urls))

    search_query = " | ".join(parts)
    return {"watch_name": watch_name, "search_query": search_query}


def ensure_query_includes_urls(search_query: str, source_urls: Any) -> str:
    query = (search_query or "").strip()
    if not isinstance(source_urls, list):
        return query

    cleaned_urls = []
    for raw_url in source_urls:
        url = str(raw_url).strip()
        if url and url not in cleaned_urls:
            cleaned_urls.append(url)

    if not cleaned_urls:
        return query

    existing_urls = set(URL_PATTERN.findall(query))
    missing_urls = [url for url in cleaned_urls if url not in existing_urls]
    if not missing_urls:
        return query

    url_suffix = "urls: " + ", ".join(missing_urls)
    return f"{query} | {url_suffix}" if query else url_suffix


def consolidate_watch_request(payload: dict[str, Any]) -> dict[str, str]:
    fallback = fallback_watch_config(payload)

    if not os.getenv("ANTHROPIC_API_KEY"):
        return fallback

    try:
        import anthropic

        claude = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        response = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=250,
            messages=[
                {
                    "role": "user",
                    "content": CONSOLIDATE_PROMPT.format(
                        payload=json.dumps(payload, ensure_ascii=True, indent=2)
                    ),
                }
            ],
        )
        text = response.content[0].text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        result = json.loads(text.strip())

        watch_name = str(result.get("watch_name", "")).strip() or fallback["watch_name"]
        search_query = str(result.get("search_query", "")).strip() or fallback["search_query"]
        search_query = ensure_query_includes_urls(search_query, payload.get("source_urls"))
        return {"watch_name": watch_name, "search_query": search_query}
    except Exception as error:
        print(f"[WATCH CONFIG] Consolidation failed: {error}")
        return fallback
