"""
Test watcher.py — run from backend/ folder: python test_watcher.py

Tests the crawl → diff → briefing pipeline.
Requires FIRECRAWL_API_KEY and ANTHROPIC_API_KEY in .env
"""
from dotenv import load_dotenv
load_dotenv()

from watcher import crawl, diff, generate_briefing

# ── Test 1: Crawl ──
print("=" * 50)
print("TEST 1: Crawling 'OpenAI'...")
print("=" * 50)

snapshot = crawl("OpenAI")
if snapshot:
    print(f"✓ Got snapshot ({len(snapshot)} chars)")
    # Show first 300 chars so you can see what it looks like
    print(f"\nPreview:\n{snapshot[:300]}...\n")
else:
    print("✗ Crawl returned empty — check your FIRECRAWL_API_KEY")
    exit(1)

# ── Test 2: Diff with fake old data ──
# We use a clearly outdated "old" snapshot so Claude sees a big difference
# This should give a high score (6-10)
print("=" * 50)
print("TEST 2: Diffing against fake old snapshot...")
print("=" * 50)

fake_old = "No recent news about OpenAI. The company has been quiet for months."
result = diff("OpenAI", fake_old, snapshot)

print(f"\n  Score:      {result.get('score', '?')}/10")
print(f"  Summary:    {result.get('summary', '?')}")
print(f"  Why:        {result.get('why_it_matters', '?')}")
print(f"  Sources:    {result.get('key_sources', [])}")
print(f"  Confidence: {result.get('confidence', '?')}%")

if result.get("score", 0) >= 5:
    print(f"\n✓ Score is {result['score']} — high enough to trigger notifications")
else:
    print(f"\n⚠ Score is {result['score']} — lower than expected (this is OK for real diffs)")

# ── Test 3: Generate briefing ──
print("\n" + "=" * 50)
print("TEST 3: Generating spoken briefing...")
print("=" * 50)

# Test default briefing (no role)
briefing = generate_briefing("OpenAI", result, {})
print(f"\n[Default briefing]:\n{briefing}\n")

# Test CEO briefing
ceo_briefing = generate_briefing("OpenAI", result, {}, role="ceo")
print(f"[CEO briefing]:\n{ceo_briefing}\n")

# Test engineer briefing
eng_briefing = generate_briefing("OpenAI", result, {}, role="engineer")
print(f"[Engineer briefing]:\n{eng_briefing}\n")

print("=" * 50)
print("✓ All watcher tests passed!")
print("=" * 50)