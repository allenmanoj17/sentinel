import os
import json
from supabase import create_client
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv()

# Shared Supabase client for API handlers and scheduled jobs.

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def init_db():
    """Tables already exist in Supabase (created via SQL Editor).
    This just verifies the connection works."""
    try:
        supabase.table("watches").select("id").limit(1).execute()
        print("[DB] Supabase connection verified")
    except Exception as e:
        print(f"[DB] Supabase connection failed: {e}")


# Watch rows represent the recurring monitoring jobs.

def create_watch(topic, mode, phone, email, threshold, frequency):
    """Create a new watch. Returns the new watch ID."""
    result = supabase.table("watches").insert({
        "topic": topic,
        "mode": mode,
        "phone": phone,
        "email": email,
        "threshold": threshold,
        "frequency_minutes": frequency,
    }).execute()
    return result.data[0]["id"]


def get_all_watches():
    """Return all active watches as list of dicts."""
    result = supabase.table("watches") \
        .select("*") \
        .eq("active", True) \
        .execute()
    return result.data


def get_previous_watches(limit=50):
    """Return inactive watches, newest first."""
    result = supabase.table("watches") \
        .select("*") \
        .eq("active", False) \
        .order("id", desc=True) \
        .limit(limit) \
        .execute()
    return result.data


def get_watch_by_id(watch_id):
    """Return a single watch as dict, or None."""
    result = supabase.table("watches") \
        .select("*") \
        .eq("id", watch_id) \
        .execute()
    return result.data[0] if result.data else None


def update_baseline(watch_id, snapshot):
    """Store the latest crawl result as the baseline.
    Next crawl will be compared against this to detect changes."""
    supabase.table("watches") \
        .update({"baseline_snapshot": snapshot}) \
        .eq("id", watch_id) \
        .execute()


def update_calendar_token(watch_id, token_json):
    """Store Google Calendar OAuth token for a watch."""
    supabase.table("watches") \
        .update({"calendar_token": token_json}) \
        .eq("id", watch_id) \
        .execute()


def deactivate_watch(watch_id):
    """Soft-delete: sets active=false so polling stops."""
    supabase.table("watches") \
        .update({"active": False}) \
        .eq("id", watch_id) \
        .execute()


# Team members receive role-specific briefings from the same triggering event.

def add_team_member(watch_id, name, role, phone, email=None):
    """Add a team member to a watch."""
    supabase.table("team_members").insert({
        "watch_id": watch_id,
        "name": name,
        "role": role,
        "phone": phone,
        "email": email,
    }).execute()


def get_team_members(watch_id):
    """Return all team members for a watch."""
    result = supabase.table("team_members") \
        .select("*") \
        .eq("watch_id", watch_id) \
        .execute()
    return result.data


# Logs capture every poll cycle, even when nothing escalates.

def insert_log(watch_id, score, summary, sources, action):
    """Insert a poll log entry. Returns the new log ID."""
    result = supabase.table("logs").insert({
        "watch_id": watch_id,
        "score": score,
        "summary": summary,
        "sources": sources,
        "action_taken": action,
    }).execute()
    return result.data[0]["id"]


def update_log_action(log_id, action):
    """Update the action taken for an existing log entry."""
    supabase.table("logs") \
        .update({"action_taken": action}) \
        .eq("id", log_id) \
        .execute()


def get_logs(limit=100):
    """Return recent logs with watch topic included.
    Uses Supabase's foreign key join to pull in the topic."""
    result = supabase.table("logs") \
        .select("*, watches(topic)") \
        .order("crawl_time", desc=True) \
        .limit(limit) \
        .execute()

    # Flatten the join so the API returns one predictable object per log row.
    logs = []
    for row in result.data:
        log = dict(row)
        if log.get("watches") and isinstance(log["watches"], dict):
            log["topic"] = log["watches"]["topic"]
        else:
            log["topic"] = "Unknown"
        del log["watches"]
        logs.append(log)
    return logs


# Alerts store only the events that triggered a user-facing escalation.

def insert_alert(watch_id, score, action, briefing):
    """Insert an alert. Called only when a real notification fires."""
    supabase.table("alerts").insert({
        "watch_id": watch_id,
        "score": score,
        "action_taken": action,
        "briefing": briefing,
    }).execute()


def get_latest_alert_for_watch(watch_id):
    """Return the most recent alert for a watch, or None."""
    result = supabase.table("alerts") \
        .select("*") \
        .eq("watch_id", watch_id) \
        .order("timestamp", desc=True) \
        .limit(1) \
        .execute()
    return result.data[0] if result.data else None


# Daily counters back the product rate limits.

def get_daily_call_count():
    """Count calls made today. Checks logs for call/batch_call/simulated actions."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    result = supabase.table("logs") \
        .select("id", count="exact") \
        .in_("action_taken", ["call", "batch_call", "simulated"]) \
        .gte("crawl_time", f"{today}T00:00:00Z") \
        .execute()
    return result.count or 0


def get_daily_agent_count():
    """Count agent runs today. Each alert roughly = one agent research run."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    result = supabase.table("alerts") \
        .select("id", count="exact") \
        .gte("timestamp", f"{today}T00:00:00Z") \
        .execute()
    return result.count or 0


# Call sessions keep ElevenLabs conversation state durable across backend restarts.

def save_call_session(watch_id, conversation_id=None, call_sid=None, status="initiated", briefing="", transcript=None, metadata=None, analysis=None):
    payload = {
        "watch_id": watch_id,
        "conversation_id": conversation_id or None,
        "call_sid": call_sid or None,
        "status": status or "initiated",
        "briefing": briefing or "",
        "transcript": transcript or [],
        "metadata": metadata or {},
        "analysis": analysis or {},
    }

    existing = None
    if conversation_id:
        existing = get_call_session_by_conversation_id(conversation_id)

    # ElevenLabs can send multiple updates for one conversation, so upsert by conversation id.
    if existing:
        supabase.table("call_sessions") \
            .update(payload) \
            .eq("id", existing["id"]) \
            .execute()
        return existing["id"]

    result = supabase.table("call_sessions").insert(payload).execute()
    return result.data[0]["id"] if result.data else None


def update_call_session_by_conversation(conversation_id, **fields):
    updates = {key: value for key, value in fields.items() if value is not None}
    if not updates:
        return
    supabase.table("call_sessions") \
        .update(updates) \
        .eq("conversation_id", conversation_id) \
        .execute()


def get_latest_call_session_for_watch(watch_id):
    result = supabase.table("call_sessions") \
        .select("*") \
        .eq("watch_id", watch_id) \
        .order("updated_at", desc=True) \
        .limit(1) \
        .execute()
    return result.data[0] if result.data else None


def get_call_session_by_conversation_id(conversation_id):
    result = supabase.table("call_sessions") \
        .select("*") \
        .eq("conversation_id", conversation_id) \
        .limit(1) \
        .execute()
    return result.data[0] if result.data else None

# Team records

def create_team(name):
    """Create a team. Returns the team ID."""
    result = supabase.table("teams").insert({"name": name}).execute()
    return result.data[0]["id"]

def get_all_teams():
    """Return all teams."""
    result = supabase.table("teams").select("*").execute()
    return result.data

def get_team_workspace():
    """Return a SQL-backed workspace view for the teams page."""
    result = supabase.rpc("get_team_workspace").execute()
    return result.data or []

def get_team_by_id(team_id):
    """Return a single team."""
    result = supabase.table("teams").select("*").eq("id", team_id).execute()
    return result.data[0] if result.data else None

def find_team_by_name(name):
    """Return a team by exact name."""
    result = supabase.table("teams").select("*").eq("name", name).limit(1).execute()
    return result.data[0] if result.data else None

def get_team_members_by_team(team_id):
    """Return all members of a team."""
    result = supabase.table("team_members").select("*").eq("team_id", team_id).execute()
    return result.data

def add_team_member_to_team(team_id, name, role, phone, email=None):
    """Add a member to a team."""
    supabase.table("team_members").insert({
        "team_id": team_id,
        "name": name,
        "role": role,
        "phone": phone,
        "email": email,
    }).execute()
