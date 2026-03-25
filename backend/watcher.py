"""
watcher.py — The brain of Sentinel

This file does 4 things:
1. CRAWL:   Uses Firecrawl to search the web for a topic and get a snapshot
2. DIFF:    Sends old vs new snapshot to Claude Haiku, gets a change score (0-10)
3. RESEARCH: If score is high enough, uses Firecrawl Agent for deep research
4. BRIEFING: Uses Claude Sonnet to write a natural spoken briefing for the call

The poll_watch() function ties it all together and runs on a schedule.
The scheduler checks each watch at its configured interval (every 15/30/60 min).
"""

import os
import json
import time
import threading
import re
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()

# ──────────────────────────────────────────────
# API CLIENTS
# ──────────────────────────────────────────────

from firecrawl import FirecrawlApp
import anthropic
from watch_config import normalize_sources, unpack_watch_topic

firecrawl = FirecrawlApp(api_key=os.getenv("FIRECRAWL_API_KEY"))
claude = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

URL_PATTERN = re.compile(r"https?://[^\s,]+", re.IGNORECASE)
CRAWL_CACHE_TTL_SECONDS = 300
MAX_SEED_URLS = 4
MAX_SEARCH_RESULTS = 4
MAX_TOTAL_RESULTS = 6
SNAPSHOT_CHAR_LIMIT = 4500
PER_RESULT_CHAR_LIMIT = 550

_crawl_cache: dict[str, tuple[float, str]] = {}
_crawl_cache_lock = threading.Lock()


# ──────────────────────────────────────────────
# STEP 1: CRAWL
# Searches the web for a topic using Firecrawl Search API.
# Returns a text snapshot of what's out there right now.
#
# Example: crawl("OpenAI") might return:
#   "SOURCE: TechCrunch\nURL: https://...\nOpenAI announced...\n---\n
#    SOURCE: Reuters\nURL: https://...\nThe company said...\n---"
#
# This snapshot gets compared against the previous one to detect changes.
# ──────────────────────────────────────────────

def extract_seed_urls(query: str) -> list[str]:
    seen: set[str] = set()
    urls: list[str] = []
    for match in URL_PATTERN.findall(query or ""):
        cleaned = match.rstrip(".,);]")
        if cleaned not in seen:
            seen.add(cleaned)
            urls.append(cleaned)
    return urls


def strip_urls_from_query(query: str) -> str:
    if not query:
        return ""
    cleaned = URL_PATTERN.sub("", query)
    cleaned = re.sub(r"\burls?\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\|\s*", " | ", cleaned)
    cleaned = re.sub(r"(?:\s*\|\s*){2,}", " | ", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned.strip(" |,")


def cache_get(key: str) -> str:
    if not key:
        return ""
    now = time.time()
    with _crawl_cache_lock:
        cached = _crawl_cache.get(key)
        if not cached:
            return ""
        timestamp, snapshot = cached
        if now - timestamp > CRAWL_CACHE_TTL_SECONDS:
            _crawl_cache.pop(key, None)
            return ""
        return snapshot


def cache_set(key: str, snapshot: str) -> None:
    if not key or not snapshot:
        return
    with _crawl_cache_lock:
        _crawl_cache[key] = (time.time(), snapshot)


def snapshot_entry_from_result(result, fallback_content: str = "") -> dict[str, str] | None:
    title = ""
    url = ""
    content = fallback_content or ""

    meta = getattr(result, "metadata", None)
    if meta:
        title = getattr(meta, "title", "") or ""
        url = getattr(meta, "url", "") or ""

    title = title or getattr(result, "title", "") or ""
    url = url or getattr(result, "url", "") or ""

    markdown = getattr(result, "markdown", None)
    if markdown:
        content = markdown
    elif not content:
        content = getattr(result, "description", "") or getattr(result, "extract", "") or ""

    content = str(content or "").strip()
    if not url:
        return None

    return {
        "title": str(title or urlparse(url).netloc or url).strip(),
        "url": str(url).strip(),
        "content": content[:PER_RESULT_CHAR_LIMIT],
    }


def fetch_seed_url_results(seed_urls: list[str]) -> list[dict[str, str]]:
    if not seed_urls:
        return []
    try:
        batch = firecrawl.batch_scrape(
            seed_urls[:MAX_SEED_URLS],
            formats=["markdown"],
            only_main_content=True,
            max_age=900,
            store_in_cache=True,
            ignore_invalid_urls=True,
        )
    except Exception as error:
        print(f"[CRAWL] Seed URL scrape failed: {error}")
        return []

    data = getattr(batch, "data", None)
    if isinstance(batch, dict):
        data = batch.get("data", data)
    if not isinstance(data, list):
        return []

    entries: list[dict[str, str]] = []
    for item in data:
        entry = snapshot_entry_from_result(item)
        if entry:
            entries.append(entry)
    return entries


def fetch_search_results(query: str, limit: int) -> list[dict[str, str]]:
    if not query or limit <= 0:
        return []
    try:
        results = firecrawl.search(
            query,
            limit=limit,
            scrape_options={
                "formats": ["markdown"],
                "onlyMainContent": True,
                "maxAge": 900,
                "storeInCache": True,
            },
        )
    except Exception as error:
        print(f"[CRAWL] Search failed for '{query}': {error}")
        return []

    items = results.web or []
    entries: list[dict[str, str]] = []
    for item in items:
        entry = snapshot_entry_from_result(item)
        if entry:
            entries.append(entry)
    return entries


def build_snapshot(entries: list[dict[str, str]]) -> str:
    unique_entries: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for entry in entries:
        url = entry["url"]
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        unique_entries.append(entry)
        if len(unique_entries) >= MAX_TOTAL_RESULTS:
            break

    parts: list[str] = []
    total_chars = 0
    for entry in unique_entries:
        chunk = f"SOURCE: {entry['title']}\nURL: {entry['url']}\n{entry['content']}\n---"
        if total_chars + len(chunk) > SNAPSHOT_CHAR_LIMIT and parts:
            break
        parts.append(chunk)
        total_chars += len(chunk)

    return "\n".join(parts)[:SNAPSHOT_CHAR_LIMIT]


def crawl(topic: str) -> str:
    """Search the web efficiently for a topic. Returns combined markdown snapshot."""
    cache_key = (topic or "").strip()
    cached = cache_get(cache_key)
    if cached:
        print(f"[CRAWL] Cache hit for '{topic}'")
        return cached

    try:
        seed_urls = extract_seed_urls(topic)
        search_query = strip_urls_from_query(topic)

        seed_entries = fetch_seed_url_results(seed_urls)
        remaining = MAX_SEARCH_RESULTS if not seed_entries else max(0, MAX_TOTAL_RESULTS - len(seed_entries))
        search_entries = fetch_search_results(search_query or topic, remaining)

        snapshot = build_snapshot(seed_entries + search_entries)
        print(
            f"[CRAWL] Built snapshot for '{topic}' from "
            f"{len(seed_entries)} seed URLs and {len(search_entries)} search results "
            f"({len(snapshot)} chars)"
        )
        if snapshot:
            cache_set(cache_key, snapshot)
        return snapshot

    except Exception as e:
        print(f"[CRAWL] Failed for '{topic}': {e}")
        return ""


def extract_snapshot_sources(snapshot: str) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    for chunk in snapshot.split("\n---"):
        lines = [line.strip() for line in chunk.splitlines() if line.strip()]
        if not lines:
            continue
        name = ""
        url = ""
        for line in lines:
            if line.startswith("SOURCE:"):
                name = line.removeprefix("SOURCE:").strip()
            elif line.startswith("URL:"):
                url = line.removeprefix("URL:").strip()
        if name and url:
            sources.append({"name": name, "url": url})
    return sources


def reconcile_sources_with_snapshot(raw_sources: list[dict[str, str]], snapshot: str) -> list[dict[str, str]]:
    snapshot_sources = extract_snapshot_sources(snapshot)
    if not snapshot_sources:
        return []

    def simplify(text: str) -> str:
        return "".join(ch.lower() for ch in text if ch.isalnum())

    snapshot_by_url = {source["url"]: source for source in snapshot_sources}
    reconciled: list[dict[str, str]] = []

    for source in normalize_sources(raw_sources):
        matched = None
        source_url = source.get("url", "").strip()
        source_name = source.get("name", "").strip()

        if source_url and source_url in snapshot_by_url:
            matched = snapshot_by_url[source_url]
        elif source_name:
            target = simplify(source_name)
            for candidate in snapshot_sources:
                candidate_name = simplify(candidate["name"])
                candidate_host = simplify(urlparse(candidate["url"]).netloc)
                if target and (
                    target == candidate_name
                    or target in candidate_name
                    or candidate_name in target
                    or target in candidate_host
                ):
                    matched = candidate
                    break

        if matched and matched["url"] not in {item["url"] for item in reconciled}:
            reconciled.append(matched)

    return reconciled


# ──────────────────────────────────────────────
# STEP 2: DIFF
# Compares old snapshot vs new snapshot using Claude Haiku.
# Returns a score (0-10) and summary of what changed.
#
# Score meanings:
#   0-4: Noise. Same stories, routine updates. Don't bother anyone.
#   5-7: Noteworthy. Worth a text message, not a phone call.
#   8-10: Breaking. Major news. Worth interrupting someone's day.
#
# Example return:
#   {"score": 8, "summary": "OpenAI announced GPT-5...", 
#    "why_it_matters": "First major model release in 6 months",
#    "key_sources": ["TechCrunch", "Reuters"], "confidence": 90}
# ──────────────────────────────────────────────

DIFF_PROMPT = """You are a signal detector monitoring the web for meaningful changes.

TOPIC: {topic}

PREVIOUS SNAPSHOT:
{old}

CURRENT SNAPSHOT:
{new}

Score the magnitude of change 0-10:
- 0-4: Noise, routine updates, same stories recycled. Do NOT alert.
- 5-7: Noteworthy new development. Worth a message, not a call.
- 8-10: Breaking, significant, time-sensitive. Leadership change, major product news, 
  regulatory action, financial event, crisis. Worth interrupting someone for.

Only score 8+ if something a front-page journalist would lead with today.

Respond ONLY with valid JSON, no preamble, no markdown:
{{
  "score": <integer 0-10>,
  "summary": "<2 sentences on what changed>",
  "why_it_matters": "<1 sentence on significance>",
  "key_sources": [
    {{"name": "<source name>", "url": "<https://source-url>"}},
    {{"name": "<source name>", "url": "<https://source-url>"}}
  ],
  "confidence": <integer 0-100>
}}"""


def diff(topic: str, old_snapshot: str, new_snapshot: str) -> dict:
    """Compare two snapshots using Claude Haiku. Returns score + summary."""
    try:
        prompt = DIFF_PROMPT.format(topic=topic, old=old_snapshot, new=new_snapshot)

        response = claude.messages.create(
            model="claude-haiku-4-5-20251001",  # Fast + cheap, perfect for scoring
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )

        text = response.content[0].text.strip()

        # Claude sometimes wraps JSON in markdown code blocks — strip them
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        result = json.loads(text)
        result["key_sources"] = reconcile_sources_with_snapshot(
            normalize_sources(result.get("key_sources")),
            new_snapshot,
        )
        print(f"[DIFF] '{topic}' scored {result.get('score', '?')}/10")
        return result

    except json.JSONDecodeError as e:
        print(f"[DIFF] JSON parse failed for '{topic}': {e}")
        print(f"[DIFF] Raw response: {text[:200]}")
        # Return safe defaults so the pipeline doesn't crash
        return {
            "score": 0,
            "summary": "Diff analysis failed - could not parse response",
            "why_it_matters": "",
            "key_sources": [],
            "confidence": 0
        }
    except Exception as e:
        print(f"[DIFF] Failed for '{topic}': {e}")
        return {
            "score": 0,
            "summary": "Diff analysis failed",
            "why_it_matters": "",
            "key_sources": [],
            "confidence": 0
        }


# ──────────────────────────────────────────────
# STEP 3: DEEP RESEARCH (Firecrawl Agent)
# Only runs when score >= threshold (usually 7-9).
# Uses Firecrawl's autonomous Agent to do deep research.
# The agent browses multiple pages, follows links, finds primary sources.
#
# This is the "research preview" feature the hackathon judges built.
# It's what makes Sentinel's briefings rich instead of surface-level.
#
# Returns a dict with structured findings, or {} if it fails/times out.
# ──────────────────────────────────────────────

def run_agent_research(topic: str, summary: str) -> dict:
    """Run Firecrawl Agent for deep autonomous research."""
    try:
        print(f"[AGENT] Starting deep research on '{topic}'...")

        # agent() is the blocking version — it polls automatically and returns when done
        # Much simpler than start_agent() + manual polling loop
        result = firecrawl.agent(
            prompt=f"""Deep research task: {topic}

Recent development detected: {summary}

Find:
1. The full context of what happened and when
2. 3-5 specific sources with publication times
3. Historical precedents or similar past events
4. What this likely means for the next 48 hours
5. Key quotes or data points from primary sources

Return structured findings with source citations.""",
            model="spark-1-pro",
            max_credits=500,
            timeout=180  # Max 3 minutes
        )

        print(f"[AGENT] Research complete")
        # result might be an object or dict — handle both
        if hasattr(result, "data"):
            return result.data or {}
        elif isinstance(result, dict):
            return result.get("data", result)
        return {}

    except Exception as e:
        print(f"[AGENT] Research error: {e}")
        return {}


# ──────────────────────────────────────────────
# STEP 4: GENERATE BRIEFING
# Takes the diff result + research and writes a natural spoken briefing.
# Uses Claude Sonnet (smarter model) because this text will be SPOKEN aloud.
#
# Role-aware: if this is for a CEO, it focuses on strategy.
# If for an engineer, it focuses on technical details.
# If for a CFO, it focuses on financial impact.
#
# The briefing is 60-90 words of spoken prose — like a journalist friend
# calling you to say "hey, you need to know about this."
# ──────────────────────────────────────────────

BRIEFING_PROMPT = """You are a sharp intelligence briefer calling {recipient} about {topic}.

DETECTED SHIFT:
{summary}

WHY IT MATTERS:
{why_it_matters}

DEEP RESEARCH FINDINGS:
{research}

Generate a natural spoken briefing (60-90 words). Rules:
- Sound like a smart journalist friend who just picked up the phone
- Cite 2 sources BY NAME inline: "According to Reuters two hours ago..."
- Give a spoken confidence score at the end: "I'm 85% confident this is significant."
- No bullet points. Spoken prose only.
- End with: "Want me to dig deeper into any of this?"

{role_instruction}"""

# Each role gets a different angle on the same event
ROLE_INSTRUCTIONS = {
    "ceo": "Focus on strategic implications and competitive positioning.",
    "engineer": "Focus on technical details, system impact, and implementation concerns.",
    "cfo": "Focus on financial impact, cost implications, and revenue effects.",
    "marketing": "Focus on communications implications and how competitors will respond.",
    "default": "Give a balanced overview covering the most important aspects."
}


def generate_briefing(topic: str, diff_result: dict, research_data: dict, role: str = None) -> str:
    """Generate a natural spoken briefing using Claude Sonnet.
    
    Args:
        topic: What we're watching ("OpenAI")
        diff_result: Output from diff() — has score, summary, why_it_matters
        research_data: Output from run_agent_research() — deep findings
        role: Optional role for team mode — "ceo", "engineer", "cfo", "marketing"
    
    Returns:
        A string of spoken prose ready to be read aloud by ElevenLabs
    """
    role_instruction = ROLE_INSTRUCTIONS.get(role, ROLE_INSTRUCTIONS["default"])
    recipient = f"a {role}" if role else "the user"

    # Format research data — cap it to avoid hitting token limits
    if research_data:
        research_text = json.dumps(research_data)[:3000]
    else:
        research_text = "No deep research available yet."

    prompt = BRIEFING_PROMPT.format(
        recipient=recipient,
        topic=topic,
        summary=diff_result.get("summary", ""),
        why_it_matters=diff_result.get("why_it_matters", ""),
        research=research_text,
        role_instruction=role_instruction
    )

    try:
        response = claude.messages.create(
            model="claude-haiku-4-5-20251001",  # Using Haiku to save credits
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        briefing = response.content[0].text
        print(f"[BRIEFING] Generated {len(briefing)} chars for {recipient}")
        return briefing

    except Exception as e:
        print(f"[BRIEFING] Generation failed: {e}")
        # Fallback briefing — basic but functional
        return (
            f"Alert: significant development detected regarding {topic}. "
            f"{diff_result.get('summary', 'Details are still emerging.')} "
            f"I'm moderately confident this is significant. "
            f"Want me to dig deeper into any of this?"
        )


# ──────────────────────────────────────────────
# POLL WATCH — The main loop function
# Called by APScheduler at each watch's configured interval.
#
# Flow:
#   1. Crawl the web for the topic
#   2. If first run → store as baseline and return
#   3. Compare new snapshot against baseline using Claude
#   4. If score < 5 → update baseline, do nothing
#   5. If score >= threshold → run deep research
#   6. Hand off to notifier to call/SMS/email
# ──────────────────────────────────────────────

def poll_watch(watch: dict):
    """Main polling function. Called on a schedule for each active watch."""
    watch_id = watch["id"]

    # Import DB functions here to avoid circular imports
    from db import (
        get_daily_agent_count,
        get_watch_by_id,
        insert_log,
        update_baseline,
        update_log_action,
    )

    current_watch = get_watch_by_id(watch_id)
    if not current_watch:
        print(f"\n[POLL] Watch {watch_id} no longer exists, skipping")
        return
    if not current_watch.get("active", True):
        print(f"\n[POLL] Watch {watch_id} is inactive, skipping")
        return

    watch_name, search_query = unpack_watch_topic(current_watch["topic"])
    threshold = current_watch.get("threshold", 7)

    print(f"\n[POLL] Checking '{watch_name}' (watch {watch_id})...")

    # 1. Get fresh snapshot from the web
    new_snapshot = crawl(search_query)
    if not new_snapshot:
        print(f"[POLL] Empty crawl result for '{watch_name}', skipping")
        return

    # 2. First run — no baseline exists yet, just store and return
    if not current_watch.get("baseline_snapshot"):
        update_baseline(watch_id, new_snapshot)
        insert_log(watch_id, 0, "Initial baseline stored", "", "silent")
        print(f"[POLL] Stored initial baseline for '{watch_name}'")
        return

    # 3. Compare new snapshot against the stored baseline
    result = diff(watch_name, current_watch["baseline_snapshot"], new_snapshot)
    score = result.get("score", 0)

    # 4. Log this poll cycle (dashboard will show this)
    log_id = insert_log(
        watch_id, 
        score, 
        result.get("summary", ""),
        json.dumps(result.get("key_sources", [])),
        "pending"  # Will be updated by notifier
    )

    # 5. Low score → update baseline and move on
    if score < 5:
        update_baseline(watch_id, new_snapshot)
        print(f"[POLL] Score {score} < 5, updating baseline quietly")
        return

    # 6. High score → run deep research if within daily limit
    research = {}
    if score >= threshold:
        if get_daily_agent_count() < 10:  # Max 10 agent runs per day
            research = run_agent_research(search_query, result.get("summary", ""))
        else:
            print(f"[POLL] Daily agent limit reached, skipping deep research")

    # 7. Hand off to notifier — it decides whether to call, SMS, or email
    from notifier import notify
    runtime_watch = dict(current_watch)
    runtime_watch["topic"] = watch_name
    runtime_watch["search_query"] = search_query
    notification = notify(runtime_watch, result, research)
    update_log_action(log_id, notification.get("action", "silent"))

    # 8. Update baseline after processing
    update_baseline(watch_id, new_snapshot)


# ──────────────────────────────────────────────
# SCHEDULER
# Uses APScheduler to run poll_watch() at intervals.
# Each watch gets its own repeating job.
#
# When the FastAPI server starts:
#   1. start_scheduler() loads all active watches from the DB
#   2. For each watch, it creates a repeating job
#   3. Jobs run in background threads automatically
# ──────────────────────────────────────────────

from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()


def schedule_watch(watch: dict):
    """Add a polling job for a watch. If it already exists, replace it."""
    scheduler.add_job(
        poll_watch,                              # Function to call
        "interval",                              # Run repeatedly
        minutes=watch["frequency_minutes"],       # Every 15/30/60 min
        args=[watch],                            # Pass the watch dict
        id=f"watch_{watch['id']}",               # Unique job ID
        replace_existing=True                    # Update if already scheduled
    )
    print(f"[SCHEDULER] Watching '{watch['topic']}' every {watch['frequency_minutes']}min")


def unschedule_watch(watch_id: int):
    """Remove a watch polling job if it exists."""
    job_id = f"watch_{watch_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        print(f"[SCHEDULER] Stopped watch {watch_id}")


def start_scheduler():
    """Load all active watches and start the polling scheduler."""
    from db import get_all_watches

    watches = get_all_watches()
    for w in watches:
        schedule_watch(w)

    scheduler.start()
    print(f"[SCHEDULER] Started with {len(watches)} active watches")
