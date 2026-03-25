"""
main.py — The FastAPI server that ties everything together.
"""

import json
import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Form, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from typing import List, Optional
from elevenlabs.client import ElevenLabs

from db import (
    init_db, create_watch, add_team_member, get_all_watches,
    get_previous_watches,
    get_watch_by_id, get_logs, get_daily_call_count, get_daily_agent_count,
    insert_log, insert_alert, get_latest_alert_for_watch, get_call_session_by_conversation_id
)
from watcher import schedule_watch, start_scheduler, run_agent_research, generate_briefing, unschedule_watch
from notifier import (
    notify,
    call_briefings,
    call_watch_now,
    get_watch_conversation,
    save_transcript_for_watch,
    sync_watch_conversation,
)
from calendar_check import is_user_free, get_auth_url, exchange_code
from watch_config import consolidate_watch_request, normalize_sources, pack_watch_topic, unpack_watch_topic

MAX_CALLS_PER_DAY = 20
MAX_AGENT_RUNS_PER_DAY = 10
MAX_ACTIVE_WATCHES = 15

app = FastAPI(title="Sentinel", description="Web intelligence that calls you.")
elevenlabs_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

origins = [
    "http://localhost:3000",
    "https://localhost:3000",
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()
    start_scheduler()


# ── Models ──

class TeamMemberIn(BaseModel):
    name: str
    role: str
    phone: str
    email: Optional[str] = None

class WatchIn(BaseModel):
    topic: str
    watch_name: Optional[str] = None
    source_urls: Optional[List[str]] = None
    mode: str = "personal"
    phone: Optional[str] = None
    email: Optional[str] = None
    threshold: int = 7
    frequency_minutes: int = 30
    watch_type: Optional[str] = None
    change_types: Optional[List[str]] = None
    impact_types: Optional[List[str]] = None
    briefing_focus: Optional[List[str]] = None
    require_sources: bool = True
    require_persistence: bool = True
    official_sources_only: bool = False
    urgency: Optional[str] = None
    extra_information: Optional[str] = None
    team_members: Optional[List[TeamMemberIn]] = None
    team_id: Optional[int] = None

class TeamIn(BaseModel):
    name: str


def normalize_workspace_watch(team_watch: dict) -> dict:
    display_name, search_query = unpack_watch_topic(team_watch.get("topic", ""))
    normalized = dict(team_watch)
    normalized["topic"] = display_name
    normalized["search_query"] = search_query
    return normalized


def normalize_conversation_payload(payload: dict) -> dict:
    transcript = payload.get("transcript") or []
    normalized_transcript = []
    for turn in transcript:
        if hasattr(turn, "model_dump"):
            turn = turn.model_dump()
        elif hasattr(turn, "dict"):
            turn = turn.dict()
        elif not isinstance(turn, dict):
            turn = {}
        normalized_transcript.append(
            {
                "role": str(turn.get("role", "")),
                "message": str(turn.get("message", "")).strip(),
                "time_in_call_secs": turn.get("time_in_call_secs"),
            }
        )
    return {
        "conversation_id": payload.get("conversation_id", ""),
        "call_sid": payload.get("call_sid", ""),
        "status": payload.get("status", "unknown"),
        "briefing": payload.get("briefing", ""),
        "transcript": normalized_transcript,
        "analysis": payload.get("analysis") or {},
        "metadata": payload.get("metadata") or {},
        "updated_at": payload.get("updated_at"),
    }


# ── Watch routes ──

@app.post("/watch")
async def create_watch_route(data: WatchIn):
    active = get_all_watches()
    if len(active) >= MAX_ACTIVE_WATCHES:
        raise HTTPException(429, f"Maximum {MAX_ACTIVE_WATCHES} active watches reached")

    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    # The packed topic lets us keep the existing schema while storing both
    # the human-friendly watch name and the Firecrawl search query.
    config = consolidate_watch_request(payload)
    stored_topic = pack_watch_topic(config["watch_name"], config["search_query"])

    watch_id = create_watch(
        topic=stored_topic,
        mode=data.mode,
        phone=data.phone,
        email=data.email,
        threshold=data.threshold,
        frequency=data.frequency_minutes
    )

    team_id = None

    # Team watches keep their members in the team tables so one signal can
    # produce role-specific briefings without duplicating watch rows.
    if data.mode == "team" and data.team_members:
        from db import create_team, add_team_member_to_team, supabase

        # Use existing team_id or create a new team
        if data.team_id:
            team_id = data.team_id
        else:
            team_id = create_team(f"{config['watch_name']} team")

        # Link the watch to the team
        supabase.table("watches").update({"team_id": team_id}).eq("id", watch_id).execute()

        # Add members to the team
        for member in data.team_members:
            add_team_member_to_team(team_id, member.name, member.role, member.phone, member.email)

    watch = get_watch_by_id(watch_id)
    if watch:
        schedule_watch(watch)

    return {"id": watch_id, "status": "watching", "team_id": team_id, "topic": config["watch_name"]}


@app.get("/watches")
async def list_watches():
    watches = get_all_watches()
    previous_watches = get_previous_watches()
    for watch in watches:
        display_name, search_query = unpack_watch_topic(watch.get("topic", ""))
        watch["topic"] = display_name
        watch["search_query"] = search_query
    for watch in previous_watches:
        display_name, search_query = unpack_watch_topic(watch.get("topic", ""))
        watch["topic"] = display_name
        watch["search_query"] = search_query
    return {"watches": watches, "previous_watches": previous_watches}


@app.post("/watch/{watch_id}/stop")
async def stop_watch_route(watch_id: int):
    from db import deactivate_watch

    watch = get_watch_by_id(watch_id)
    if not watch:
        raise HTTPException(404, "Watch not found")

    deactivate_watch(watch_id)
    unschedule_watch(watch_id)
    return {"status": "stopped", "watch_id": watch_id}


@app.get("/watch/{watch_id}/briefing-preview")
async def briefing_preview_route(watch_id: int):
    watch = get_watch_by_id(watch_id)
    if not watch:
        raise HTTPException(404, "Watch not found")

    display_name, _ = unpack_watch_topic(watch.get("topic", ""))
    latest_alert = get_latest_alert_for_watch(watch_id)
    latest_log = next((log for log in get_logs(limit=100) if log.get("watch_id") == watch_id), None)

    if not latest_alert and not latest_log:
        return {
            "watch_id": watch_id,
            "topic": display_name,
            "has_briefing": False,
            "summary": "",
            "briefing": "",
            "score": 0,
            "action_taken": "silent",
            "sources": [],
        }

    sources = normalize_sources(latest_log.get("sources") if latest_log else [])
    return {
        "watch_id": watch_id,
        "topic": display_name,
        "has_briefing": bool((latest_alert or {}).get("briefing") or (latest_log or {}).get("summary")),
        "summary": (latest_log or {}).get("summary", ""),
        "briefing": (latest_alert or {}).get("briefing", "") or (latest_log or {}).get("summary", ""),
        "score": (latest_alert or {}).get("score", (latest_log or {}).get("score", 0)),
        "action_taken": (latest_alert or {}).get("action_taken", (latest_log or {}).get("action_taken", "silent")),
        "sources": sources,
    }


@app.post("/watch/{watch_id}/call-now")
async def call_now_route(watch_id: int):
    if get_daily_call_count() >= MAX_CALLS_PER_DAY:
        raise HTTPException(429, "Daily call limit reached")

    watch = get_watch_by_id(watch_id)
    if not watch:
        raise HTTPException(404, "Watch not found")

    display_name, _ = unpack_watch_topic(watch.get("topic", ""))
    watch["topic"] = display_name
    latest_alert = get_latest_alert_for_watch(watch_id)
    latest_log = next((log for log in get_logs(limit=100) if log.get("watch_id") == watch_id), None)

    briefing = (latest_alert or {}).get("briefing", "").strip()
    if not briefing:
        if latest_log and latest_log.get("summary"):
            briefing = (
                f"Sentinel update for {display_name}. "
                f"{latest_log['summary']} "
                f"Open the dashboard for the linked source evidence."
            )
        else:
            raise HTTPException(400, "No briefing is available for this watch yet")

    outcome = call_watch_now(watch, briefing)
    if outcome.get("status") != "calling":
        raise HTTPException(400, outcome.get("reason", "Call initiation failed"))

    insert_alert(
        watch_id,
        (latest_alert or {}).get("score", (latest_log or {}).get("score", 0)),
        "call",
        briefing,
    )
    insert_log(
        watch_id,
        (latest_log or {}).get("score", 0),
        (latest_log or {}).get("summary", "Manual call initiated"),
        json.dumps(normalize_sources((latest_log or {}).get("sources"))),
        "call",
    )

    return {
        "status": "calling",
        "watch_id": watch_id,
        "topic": display_name,
        "call_id": outcome.get("call_id"),
        "conversation_id": outcome.get("conversation_id", ""),
    }


@app.get("/watch/{watch_id}/conversation")
async def watch_conversation_route(watch_id: int):
    watch = get_watch_by_id(watch_id)
    if not watch:
        raise HTTPException(404, "Watch not found")

    state = sync_watch_conversation(watch_id)
    return {
        "watch_id": watch_id,
        "topic": unpack_watch_topic(watch.get("topic", ""))[0],
        "conversation": normalize_conversation_payload(state),
    }


@app.get("/logs")
async def list_logs(limit: int = Query(default=100, le=500)):
    logs = get_logs(limit=limit)
    for log in logs:
        display_name, _ = unpack_watch_topic(log.get("topic", ""))
        log["topic"] = display_name
        log["sources"] = normalize_sources(log.get("sources"))
    return {"logs": logs}


@app.get("/limits")
async def get_limits():
    return {
        "calls_today": get_daily_call_count(),
        "agent_runs_today": get_daily_agent_count(),
        "active_watches": len(get_all_watches()),
        "limits": {
            "calls": MAX_CALLS_PER_DAY,
            "agent_runs": MAX_AGENT_RUNS_PER_DAY,
            "watches": MAX_ACTIVE_WATCHES,
        }
    }


@app.post("/simulate")
async def simulate(watch_id: int, topic: str = "OpenAI"):
    if get_daily_call_count() >= MAX_CALLS_PER_DAY:
        raise HTTPException(429, "Daily call limit reached")

    fake_result = {
        "score": 9,
        "summary": f"Significant development detected around {topic}. Multiple sources reporting simultaneously.",
        "why_it_matters": "This is a simulated alert demonstrating Sentinel's notification system.",
        "key_sources": [
            {"name": "Simulated source 1", "url": "https://example.com/simulated-source-1"},
            {"name": "Simulated source 2", "url": "https://example.com/simulated-source-2"},
        ],
        "confidence": 85
    }

    research = {}

    watch = get_watch_by_id(watch_id)
    if not watch:
        raise HTTPException(404, f"Watch {watch_id} not found")
    display_name, _ = unpack_watch_topic(watch.get("topic", ""))
    watch["topic"] = display_name

    notify(watch, fake_result, research)

    insert_log(watch_id, 9, fake_result["summary"], json.dumps(fake_result["key_sources"]), "simulated")

    return {"status": "simulation fired", "topic": topic, "watch_id": watch_id}


# ── Twilio webhook ──

@app.post("/twilio/voice")
async def twilio_voice(CallSid: str = Form(default="")):
    briefing = call_briefings.pop(
        CallSid,
        "Hello, I have an intelligence update for you regarding a topic you're monitoring."
    )
    briefing_safe = (
        briefing.replace("&", "&amp;").replace('"', "&quot;")
        .replace("'", "&apos;").replace("<", "&lt;").replace(">", "&gt;")
    )
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">{briefing_safe}</Say>
  <Pause length="2"/>
  <Say voice="Polly.Matthew">This was a Sentinel intelligence briefing. Goodbye.</Say>
</Response>"""
    return PlainTextResponse(twiml, media_type="application/xml")


@app.post("/elevenlabs/webhook")
async def elevenlabs_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("elevenlabs-signature")
    secret = os.getenv("ELEVENLABS_WEBHOOK_SECRET")

    if secret and signature:
        try:
            event = elevenlabs_client.webhooks.construct_event(
                rawBody=payload.decode("utf-8"),
                sig_header=signature,
                secret=secret,
            )
        except Exception:
            raise HTTPException(401, "Invalid webhook signature")
    else:
        event = json.loads(payload.decode("utf-8"))

    event_type = getattr(event, "type", None) or event.get("type")
    event_data = getattr(event, "data", None) or event.get("data") or {}

    if event_type == "post_call_transcription":
        conversation_id = str(event_data.get("conversation_id", "")).strip()
        if conversation_id:
            session = get_call_session_by_conversation_id(conversation_id)
            if session:
                # Match the webhook back to the persisted call session so
                # transcripts survive backend restarts.
                save_transcript_for_watch(
                    session["watch_id"],
                    conversation_id=conversation_id,
                    transcript=event_data.get("transcript") or [],
                    metadata=event_data.get("metadata") or {},
                    analysis=event_data.get("analysis") or {},
                    status=str(event_data.get("status", "done")),
                )

    return {"status": "received"}


# ── Calendar ──

@app.get("/calendar/auth")
async def calendar_auth(watch_id: int):
    url = get_auth_url(watch_id)
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url)


@app.get("/calendar/callback")
async def calendar_callback(code: str, state: str):
    from db import update_calendar_token
    from fastapi.responses import RedirectResponse
    watch_id = int(state)
    token_json = exchange_code(code, watch_id)
    update_calendar_token(watch_id, token_json)
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    return RedirectResponse(f"{frontend_url}/app")


# ── Health ──

@app.get("/")
async def health():
    return {"status": "Sentinel is running", "version": "1.0.0"}


# ── Waitlist ──

@app.post("/waitlist")
async def join_waitlist(request: Request):
    from db import supabase
    body = await request.json()
    email = body.get("email", "").strip()
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email")
    try:
        supabase.table("waitlist").insert({"email": email}).execute()
    except Exception:
        pass
    return {"status": "joined"}


# ── Team by watch (backwards compatible) ──

@app.get("/team/{watch_id}")
async def get_team(watch_id: int):
    from db import get_team_members, get_team_members_by_team

    watch = get_watch_by_id(watch_id)
    if not watch:
        raise HTTPException(404, "Watch not found")

    # Try team_id first (new way), fall back to watch_id (old way)
    team_id = watch.get("team_id")
    if team_id:
        members = get_team_members_by_team(team_id)
    else:
        members = get_team_members(watch_id)

    return {
        "members": members,
        "watch_id": watch_id,
        "team_id": team_id,
        "mode": watch.get("mode", "personal"),
        "topic": unpack_watch_topic(watch.get("topic", "Unknown"))[0],
    }


@app.post("/team/{watch_id}/add")
async def add_team_member_route(watch_id: int, member: TeamMemberIn):
    from db import get_team_members_by_team, add_team_member_to_team

    watch = get_watch_by_id(watch_id)
    if not watch:
        raise HTTPException(404, "Watch not found")
    if watch.get("mode") != "team":
        raise HTTPException(400, "Watch is not in team mode")

    # Add to team if team_id exists, otherwise add to watch directly
    team_id = watch.get("team_id")
    if team_id:
        add_team_member_to_team(team_id, member.name, member.role, member.phone, member.email)
    else:
        add_team_member(watch_id, member.name, member.role, member.phone, member.email)

    return {"status": "added", "watch_id": watch_id, "team_id": team_id}


# ── Alerts ──

@app.get("/alerts")
async def list_alerts(limit: int = Query(default=50, le=200)):
    from db import supabase
    result = (
        supabase.table("alerts")
        .select("*, watches(topic, mode)")
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    alerts = []
    for row in result.data:
        alert = dict(row)
        if alert.get("watches") and isinstance(alert["watches"], dict):
            alert["topic"] = unpack_watch_topic(alert["watches"]["topic"])[0]
            alert["mode"] = alert["watches"]["mode"]
        else:
            alert["topic"] = "Unknown"
            alert["mode"] = "personal"
        del alert["watches"]
        alerts.append(alert)
    return {"alerts": alerts}


# ── Teams (standalone CRUD) ──

@app.post("/teams")
async def create_team_route(data: TeamIn):
    from db import create_team
    team_id = create_team(data.name)
    return {"id": team_id, "status": "created"}


@app.get("/teams")
async def list_teams():
    from db import get_all_teams
    return {"teams": get_all_teams()}


@app.get("/teams/workspace")
async def get_team_workspace_route():
    from db import get_team_workspace

    rows = get_team_workspace()
    teams = []
    for row in rows:
        team = dict(row)
        team["watches"] = [
            normalize_workspace_watch(watch if isinstance(watch, dict) else {})
            for watch in (team.get("watches") or [])
        ]
        team["members"] = [dict(member) for member in (team.get("members") or []) if isinstance(member, dict)]
        teams.append(team)
    return {"teams": teams}


@app.get("/teams/{team_id}")
async def get_team_detail(team_id: int):
    from db import get_team_by_id, get_team_members_by_team
    team = get_team_by_id(team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    members = get_team_members_by_team(team_id)
    return {"team": team, "members": members}


@app.post("/teams/{team_id}/members")
async def add_member_to_team(team_id: int, member: TeamMemberIn):
    from db import get_team_by_id, add_team_member_to_team
    team = get_team_by_id(team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    add_team_member_to_team(team_id, member.name, member.role, member.phone, member.email)
    return {"status": "added"}


@app.post("/teams/seed")
async def seed_team_workspace():
    from db import find_team_by_name, create_team, add_team_member_to_team, supabase

    team_name = "Launch response pod"
    existing_team = find_team_by_name(team_name)
    if existing_team:
        return {"status": "exists", "team_id": existing_team["id"]}

    team_id = create_team(team_name)
    stored_topic = pack_watch_topic(
        "OpenAI launch watch",
        "OpenAI product launch pricing page release notes https://openai.com/news https://openai.com/api/pricing",
    )
    watch_id = create_watch(
        topic=stored_topic,
        mode="team",
        phone=None,
        email=None,
        threshold=7,
        frequency=60,
    )
    supabase.table("watches").update({"team_id": team_id}).eq("id", watch_id).execute()

    seeded_members = [
        {"name": "Ava Stone", "role": "ceo", "phone": "+61400000011", "email": "ava@example.com"},
        {"name": "Noah Patel", "role": "engineer", "phone": "+61400000012", "email": "noah@example.com"},
        {"name": "Mia Chen", "role": "marketing", "phone": "+61400000013", "email": "mia@example.com"},
    ]
    for member in seeded_members:
        add_team_member_to_team(team_id, member["name"], member["role"], member["phone"], member["email"])

    insert_log(
        watch_id,
        7,
        "Seeded team watch ready for launch monitoring.",
        json.dumps([
            {"name": "OpenAI News", "url": "https://openai.com/news"},
            {"name": "OpenAI Pricing", "url": "https://openai.com/api/pricing"},
        ]),
        "silent",
    )

    return {"status": "seeded", "team_id": team_id, "watch_id": watch_id}
