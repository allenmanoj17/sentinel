"""
Test db.py against your real Supabase instance.
Run from backend/ folder: python test_db.py

Make sure your .env has SUPABASE_URL and SUPABASE_KEY set.
"""
from db import *

# 1. Verify connection
init_db()

# 2. Create a personal watch
w1 = create_watch("OpenAI", "personal", "+61400000000", "test@test.com", 5, 30)
print(f"✓ Created personal watch ID: {w1}")

# 3. Create a team watch
w2 = create_watch("AI industry funding", "team", None, None, 7, 60)
print(f"✓ Created team watch ID: {w2}")

# 4. Add team members
add_team_member(w2, "Alice (CEO)", "ceo", "+61400000001", "alice@test.com")
add_team_member(w2, "Bob (Engineer)", "engineer", "+61400000002")
add_team_member(w2, "Charlie (CFO)", "cfo", "+61400000003")
print(f"✓ Added 3 team members to watch {w2}")

# 5. Fetch watches
print(f"\n--- All active watches ---")
for w in get_all_watches():
    print(f"  [{w['id']}] {w['topic']} ({w['mode']}) every {w['frequency_minutes']}min")

# 6. Fetch team members
print(f"\n--- Team members for watch {w2} ---")
for m in get_team_members(w2):
    print(f"  {m['name']} — {m['role']} — {m['phone']}")

# 7. Test logging
insert_log(w1, 3, "Routine update, nothing new", '["TechCrunch"]', "silent")
insert_log(w1, 8, "Major announcement detected", '["Reuters", "BBC"]', "call")
print(f"\n--- Recent logs ---")
for log in get_logs(10):
    print(f"  [{log['topic']}] score={log['score']} action={log['action_taken']}")

# 8. Test counters
print(f"\n--- Daily counts ---")
print(f"  Calls today: {get_daily_call_count()}")
print(f"  Agent runs today: {get_daily_agent_count()}")

# 9. Test baseline update
update_baseline(w1, "This is a test baseline snapshot")
watch = get_watch_by_id(w1)
has_baseline = "Yes" if watch.get("baseline_snapshot") else "No"
print(f"\n  Baseline stored: {has_baseline}")

# 10. Clean up test data
print(f"\n--- Cleaning up test data ---")
deactivate_watch(w1)
deactivate_watch(w2)
print("✓ Deactivated test watches (still in DB but won't appear in active list)")

print("\n✓ All tests passed!")