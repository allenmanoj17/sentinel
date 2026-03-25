"""
notifier.py — The mouth of Sentinel

Score routing:
  0-4:  Silent
  5-7:  SMS + email
  8-10: Phone call (personal) or batch calls (team)
"""

import os
import time
from dotenv import load_dotenv
from watch_config import normalize_sources, unpack_watch_topic

load_dotenv()

from twilio.rest import Client as TwilioClient
from elevenlabs.client import ElevenLabs

twilio_client = TwilioClient(
    os.getenv("TWILIO_ACCOUNT_SID"),
    os.getenv("TWILIO_AUTH_TOKEN")
)
elevenlabs_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

call_briefings = {}


def send_sms(phone: str, message: str):
    try:
        twilio_client.messages.create(
            to=phone,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            body=message[:1600]
        )
        print(f"[SMS] Sent to {phone}")
    except Exception as e:
        print(f"[SMS] Failed to {phone}: {e}")


def send_email(email: str, topic: str, result: dict, research: dict):
    try:
        import resend
        resend.api_key = os.getenv("RESEND_API_KEY")
        source_lines = []
        for source in normalize_sources(result.get("key_sources")):
            if source.get("url"):
                source_lines.append(f"{source['name']} ({source['url']})")
            else:
                source_lines.append(source["name"])
        resend.Emails.send({
            "from": "Sentinel <onboarding@resend.dev>",
            "to": email,
            "subject": f"[Sentinel] {topic}: {result.get('summary', '')[:80]}",
            "html": f"""
                <div style="font-family: sans-serif; max-width: 600px;">
                    <h2 style="color: #22c55e;">Sentinel Alert: {topic}</h2>
                    <p><strong>Score:</strong> {result.get('score', '?')}/10</p>
                    <p><strong>Summary:</strong> {result.get('summary', 'N/A')}</p>
                    <p><strong>Why it matters:</strong> {result.get('why_it_matters', 'N/A')}</p>
                    <p><strong>Sources:</strong> {', '.join(source_lines)}</p>
                    <p><strong>Confidence:</strong> {result.get('confidence', '?')}%</p>
                    <hr>
                    <p style="color: #888; font-size: 12px;">Sent by Sentinel</p>
                </div>
            """
        })
        print(f"[EMAIL] Sent to {email}")
    except Exception as e:
        print(f"[EMAIL] Failed to {email}: {e}")


ELEVENLABS_PHONE_NUMBER_ID = "phnum_8401kmfxsntgfmk9yj14ha44p43p"

def _save_conversation_state(watch_id: int, payload: dict) -> None:
    from db import get_latest_call_session_for_watch, save_call_session

    current = get_latest_call_session_for_watch(watch_id) or {}
    merged = {**current, **payload}
    save_call_session(
        watch_id=watch_id,
        conversation_id=merged.get("conversation_id"),
        call_sid=merged.get("call_sid"),
        status=merged.get("status", "initiated"),
        briefing=merged.get("briefing", ""),
        transcript=merged.get("transcript") or [],
        metadata=merged.get("metadata") or {},
        analysis=merged.get("analysis") or {},
    )


def get_watch_conversation(watch_id: int) -> dict:
    from db import get_latest_call_session_for_watch

    return dict(get_latest_call_session_for_watch(watch_id) or {})


def save_transcript_for_watch(watch_id: int, conversation_id: str, transcript: list, metadata: dict | None = None, analysis: dict | None = None, status: str = "done") -> None:
    _save_conversation_state(
        watch_id,
        {
            "watch_id": watch_id,
            "conversation_id": conversation_id,
            "status": status,
            "transcript": transcript or [],
            "metadata": metadata or {},
            "analysis": analysis or {},
        },
    )


def fetch_conversation_details(conversation_id: str) -> dict:
    try:
        response = elevenlabs_client.conversational_ai.conversations.get(conversation_id=conversation_id)
        if hasattr(response, "model_dump"):
            return response.model_dump()
        if hasattr(response, "dict"):
            return response.dict()
        if isinstance(response, dict):
            return response
        return {}
    except Exception as error:
        print(f"[CALL] Failed to fetch conversation {conversation_id}: {error}")
        return {}


def sync_watch_conversation(watch_id: int) -> dict:
    state = get_watch_conversation(watch_id)
    conversation_id = state.get("conversation_id")
    if not conversation_id:
        return state

    details = fetch_conversation_details(conversation_id)
    if not details:
        return state

    save_transcript_for_watch(
        watch_id,
        conversation_id=conversation_id,
        transcript=details.get("transcript", []),
        metadata=details.get("metadata") or {},
        analysis=details.get("analysis") or {},
        status=str(details.get("status", state.get("status", "unknown"))),
    )
    return get_watch_conversation(watch_id)


def call_user(phone: str, briefing: str, watch_id: int) -> dict:
    try:
        import requests
        agent_id = os.getenv("ELEVENLABS_AGENT_ID")
        api_key = os.getenv("ELEVENLABS_API_KEY")

        response = requests.post(
            "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={
                "agent_id": agent_id,
                "agent_phone_number_id": ELEVENLABS_PHONE_NUMBER_ID,
                "to_number": phone,
                "conversation_initiation_client_data": {
                    "conversation_config_override": {
                        "agent": {
                            "first_message": briefing[:500]
                        }
                    }
                }
            }
        )
        result = response.json()
        conversation_id = result.get("conversation_id", "")
        call_sid = result.get("callSid", "")
        call_id = conversation_id or call_sid or "unknown"
        _save_conversation_state(
            watch_id,
            {
                "watch_id": watch_id,
                "conversation_id": conversation_id,
                "call_sid": call_sid,
                "status": "initiated",
                "briefing": briefing,
                "transcript": [],
                "metadata": {},
                "analysis": {},
            },
        )
        print(f"[CALL] Initiated to {phone} via ElevenLabs (ID: {call_id})")
        return {"conversation_id": conversation_id, "call_sid": call_sid, "call_id": str(call_id)}
    except Exception as e:
        print(f"[CALL] Failed to {phone}: {e}")
        return {}


def batch_call_team(watch_id: int, result: dict, research: dict) -> bool:
    """Call all team members with role-specific briefings.
    Checks team_id first (new way), falls back to watch_id (old way)."""
    from db import get_watch_by_id, get_team_members_by_team, get_team_members
    from watcher import generate_briefing

    watch = get_watch_by_id(watch_id)
    watch_topic, _ = unpack_watch_topic(watch.get("topic", ""))
    watch["topic"] = watch_topic

    # Get members: try team_id first, fall back to watch_id
    team_id = watch.get("team_id")
    if team_id:
        members = get_team_members_by_team(team_id)
    else:
        members = get_team_members(watch_id)

    if not members:
        print(f"[BATCH] No team members found for watch {watch_id} (team_id={team_id})")
        return False

    print(f"[BATCH] Calling {len(members)} members for '{watch['topic']}'...")

    for member in members:
        briefing = generate_briefing(
            topic=watch["topic"],
            diff_result=result,
            research_data=research,
            role=member["role"]
        )
        call_user(member["phone"], briefing, watch_id)
        time.sleep(1)

    print(f"[BATCH] All {len(members)} calls initiated")
    return True


def notify(watch: dict, result: dict, research: dict) -> dict:
    from db import insert_alert

    score = result.get("score", 0)
    threshold = watch.get("threshold", 7)
    mode = watch.get("mode", "personal")

    print(f"[NOTIFY] Score {score}, threshold {threshold}, mode {mode}")

    if score < 5:
        print(f"[NOTIFY] Score {score} < 5, staying silent")
        return {"action": "silent", "briefing": ""}

    if score < threshold:
        if watch.get("phone"):
            send_sms(watch["phone"], f"[Sentinel] {watch['topic']}: {result.get('summary', '')[:120]}")
        if watch.get("email"):
            send_email(watch["email"], watch["topic"], result, research)
        insert_alert(watch["id"], score, "sms+email", result.get("summary", ""))
        print(f"[NOTIFY] Sent SMS + email for score {score}")
        return {"action": "sms+email", "briefing": result.get("summary", "")}

    if mode == "personal":
        from calendar_check import is_user_free
        free = is_user_free(watch.get("calendar_token"))

        if free and watch.get("phone"):
            from watcher import generate_briefing
            briefing = generate_briefing(watch["topic"], result, research)
            call_user(watch["phone"], briefing, watch["id"])
            insert_alert(watch["id"], score, "call", briefing)
            print(f"[NOTIFY] Personal call initiated")
            return {"action": "call", "briefing": briefing}
        else:
            if watch.get("phone"):
                send_sms(watch["phone"], f"[URGENT] {watch['topic']}: {result.get('summary', '')[:120]}")
            if watch.get("email"):
                send_email(watch["email"], watch["topic"], result, research)
            insert_alert(watch["id"], score, "sms+email", result.get("summary", ""))
            print(f"[NOTIFY] User busy, sent SMS + email instead")
            return {"action": "sms+email", "briefing": result.get("summary", "")}

    elif mode == "team":
        if batch_call_team(watch["id"], result, research):
            insert_alert(watch["id"], score, "batch_call", result.get("summary", ""))
            print(f"[NOTIFY] Team batch call initiated")
            return {"action": "batch_call", "briefing": result.get("summary", "")}

        if watch.get("email"):
            send_email(watch["email"], watch["topic"], result, research)
        insert_alert(watch["id"], score, "silent", "No team members available for escalation.")
        print(f"[NOTIFY] Team watch had no members, no escalation sent")
        return {"action": "silent", "briefing": ""}

    return {"action": "silent", "briefing": ""}


def call_watch_now(watch: dict, briefing: str) -> dict:
    """Trigger an explicit outbound call for a watch using the current briefing text."""
    if not watch.get("phone"):
        return {"status": "error", "reason": "Watch has no phone number"}

    call = call_user(watch["phone"], briefing, watch["id"])
    if not call:
        return {"status": "error", "reason": "Call initiation failed"}

    return {
        "status": "calling",
        "call_id": call.get("call_id"),
        "conversation_id": call.get("conversation_id", ""),
        "call_sid": call.get("call_sid", ""),
    }
