"""
The Weekly Dose — Step 4: Publish a generated episode.

Uploads the newest MP3 in output/ to GitHub Releases (permanent, free audio
hosting), then calls /api/publish-episode on weeklydose.tech, which pushes the
episode to Buzzsprout and sends the newsletter via Buttondown.

Run after weekly_dose.py. Used by both the NEXUS1 timer and the GitHub Actions
fallback so the publishing logic lives in exactly one place.

Environment:
  PUBLISH_TOKEN   Shared secret for /api/publish-episode (required)
  GH_TOKEN        Only needed in CI; locally the gh CLI's own login is used
  REPO            owner/name, defaults to OddKRop/the-weekly-dose
  DRY_RUN=1       Build the release notes and print what would happen, then stop
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

OUTPUT_DIR = Path("output")
REPO = os.environ.get("REPO", "OddKRop/the-weekly-dose")
PUBLISH_URL = "https://www.weeklydose.tech/api/publish-episode"
EPISODE_BLURB = "Your weekly briefing on Norway, the world, and tech — in 20 minutes or less."
MONTHS = ["", "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]


def latest_mp3() -> Path:
    files = sorted(OUTPUT_DIR.glob("the_weekly_dose_*.mp3"), key=lambda p: p.stat().st_mtime)
    if not files:
        sys.exit("No MP3 found in output/ — run weekly_dose.py first.")
    return files[-1]


def audio_duration(path: Path) -> int:
    """Episode length in whole seconds, via ffprobe."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return int(float(result.stdout.strip()))


def load_newsletter() -> dict:
    path = OUTPUT_DIR / "newsletter.json"
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_release_notes(newsletter: dict, duration: int) -> str:
    """Release notes double as podcast show notes, so the RSS feed can read them back.

    The trailing HTML comment carries structured metadata (duration, subject) that
    /feed.xml parses. GitHub Releases is the only store of episode data — no database
    to keep in sync, and it outlives whatever podcast host we happen to use.
    """
    lines = []
    if newsletter.get("bullets"):
        lines += [f"- {b}" for b in newsletter["bullets"]]
        lines.append("")
    if newsletter.get("ending"):
        lines += [newsletter["ending"], ""]
    if not lines:
        lines = [EPISODE_BLURB, ""]

    meta = {"duration": duration, "subject": newsletter.get("subject", "")}
    lines.append(f"<!-- weekly-dose-meta: {json.dumps(meta, ensure_ascii=False)} -->")
    return "\n".join(lines)


def create_release(mp3: Path, title: str, tag: str, notes: str) -> str:
    subprocess.run(
        ["gh", "release", "create", tag, str(mp3),
         "--title", title, "--notes", notes, "--repo", REPO],
        check=True,
    )
    return f"https://github.com/{REPO}/releases/download/{tag}/{mp3.name}"


def publish(audio_url: str, title: str, newsletter: dict, newsletter_only: bool = False) -> None:
    token = os.environ.get("PUBLISH_TOKEN")
    if not token:
        sys.exit("PUBLISH_TOKEN is not set.")

    response = requests.post(
        PUBLISH_URL,
        headers={"x-publish-token": token, "Content-Type": "application/json"},
        json={
            "audio_url": audio_url,
            "title": title,
            "newsletter_subject": newsletter.get("subject"),
            "newsletter_bullets": newsletter.get("bullets"),
            "newsletter_ending": newsletter.get("ending", ""),
            "newsletter_only": newsletter_only,
        },
        timeout=120,
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    if not response.ok:
        sys.exit("✗ Publish failed")

    # The endpoint returns 200 when the episode went out but the newsletter did not, so
    # HTTP status alone is not success. Reporting "sent" here once hid a failed send
    # completely — exit non-zero instead, which also trips the systemd failure notifier.
    result = response.json().get("newsletter")
    if result is None:
        print("✓ Episode live (no newsletter content in this run)")
        return
    if not result.get("ok"):
        sys.exit(f"✗ Episode is live, but the newsletter FAILED: {result}")

    print("✓ Episode live + newsletter sent!" if not newsletter_only else "✓ Newsletter sent!")


def main() -> None:
    # Recovery path: episode already on Buzzsprout, only the newsletter needs resending.
    # Re-running the full publish would create a duplicate release and a duplicate episode.
    if "--newsletter-only" in sys.argv:
        newsletter = load_newsletter()
        if not newsletter.get("subject"):
            sys.exit("No newsletter content in output/newsletter.json.")
        print(f"Newsletter only — subject: {newsletter['subject']}")
        publish("", "", newsletter, newsletter_only=True)
        return

    mp3 = latest_mp3()
    duration = audio_duration(mp3)
    newsletter = load_newsletter()

    now = datetime.now()
    tag = f"episode-{now:%Y%m%d-%H%M}"
    # Matches the titles Buzzsprout already has, e.g. "The Weekly Dose – 31. July 2026".
    # Month names are hardcoded: NEXUS1 runs a Norwegian locale, and %B there would
    # silently start producing "juli" mid-catalogue.
    title = f"The Weekly Dose – {now.day:02d}. {MONTHS[now.month]} {now.year}"
    notes = build_release_notes(newsletter, duration)

    print(f"Episode : {title}")
    print(f"Audio   : {mp3} ({mp3.stat().st_size // 1024} KB, {duration // 60}:{duration % 60:02d})")

    if os.environ.get("DRY_RUN") == "1":
        print(f"\n[DRY RUN] Would create release {tag} with notes:\n{notes}")
        return

    audio_url = create_release(mp3, title, tag, notes)
    print(f"Released: {audio_url}")
    publish(audio_url, title, newsletter)


if __name__ == "__main__":
    main()
