"""
calendar_check.py — Google Calendar free/busy check

Checks if the user is free before making a call.
If no calendar is connected, assumes the user is free.

This is a nice-to-have feature. If you skip Google Calendar setup,
everything still works — it just always assumes the user is available.
"""

import os
import json
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()


def is_user_free(token_json: str = None) -> bool:
    """Check if the user is free for the next 15 minutes.
    
    Returns True if:
      - No calendar connected (assume free)
      - No calendar events in the next 15 minutes
    
    Returns False if:
      - User has a calendar event in the next 15 minutes
    """

    # No calendar connected — assume free during allowed calling hours
    if not token_json:
        return True

    # Try to check Google Calendar
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds = Credentials.from_authorized_user_info(json.loads(token_json))
        service = build("calendar", "v3", credentials=creds)

        now_utc = datetime.now(timezone.utc)
        result = service.freebusy().query(body={
            "timeMin": now_utc.isoformat(),
            "timeMax": (now_utc + timedelta(minutes=15)).isoformat(),
            "items": [{"id": "primary"}]
        }).execute()

        busy = result["calendars"]["primary"]["busy"]
        if busy:
            print(f"[CALENDAR] User is busy ({len(busy)} events)")
            return False
        else:
            print("[CALENDAR] User is free")
            return True

    except Exception as e:
        # If calendar check fails for any reason, assume free
        # Better to call someone than to silently miss a critical alert
        print(f"[CALENDAR] Check failed ({e}), assuming free")
        return True


def get_auth_url(watch_id: int) -> str:
    """Generate Google OAuth URL for calendar access."""
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        {"web": {
            "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=["https://www.googleapis.com/auth/calendar.readonly"],
        redirect_uri=f"{os.getenv('BASE_URL')}/calendar/callback"
    )

    url, _ = flow.authorization_url(state=str(watch_id))
    return url


def exchange_code(code: str, watch_id: int) -> str:
    """Exchange OAuth code for tokens. Returns token JSON string."""
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        {"web": {
            "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=["https://www.googleapis.com/auth/calendar.readonly"],
        redirect_uri=f"{os.getenv('BASE_URL')}/calendar/callback"
    )

    flow.fetch_token(code=code)
    creds = flow.credentials
    return creds.to_json()
