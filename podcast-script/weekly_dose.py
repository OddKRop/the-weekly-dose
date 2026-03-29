"""
The Weekly Dose — Automated News Podcast Script Generator
Steps 1–3: Fetch RSS feeds → Claude script → OpenAI TTS audio
"""

import feedparser
import anthropic
import json
import re
import textwrap
import os
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dateutil import parser as dateparser
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# ─── RSS Feed Configuration ────────────────────────────────────────────────────

FEEDS = {
    # Norwegian news
    "NRK":              "https://www.nrk.no/toppsaker.rss",
    "E24":              "https://e24.no/rss",
    # World news
    "BBC World":        "http://feeds.bbci.co.uk/news/world/rss.xml",
    # Business & markets
    "Bloomberg":        "https://feeds.bloomberg.com/markets/news.rss",
    # Tech news
    "TechCrunch":       "https://techcrunch.com/feed/",
    "The Verge":        "https://www.theverge.com/rss/index.xml",
    "Ars Technica":     "https://feeds.arstechnica.com/arstechnica/index",
}

MAX_ARTICLES_PER_FEED = 20   # Cap per source before sending to Claude
HOURS_LOOKBACK = 168         # Only include articles from the last N hours (7 days)

# ─── TTS Configuration ────────────────────────────────────────────────────────

TTS_MODEL = "tts-1-hd"      # "tts-1" (faster/cheaper) or "tts-1-hd" (higher quality)
TTS_VOICE = "echo"           # alloy | echo | fable | onyx | nova | shimmer
TTS_CHUNK_SIZE = 4000        # OpenAI max is 4096 chars; stay safely below
OUTPUT_DIR = Path("output")


# ─── Step 1: Fetch RSS Feeds ───────────────────────────────────────────────────

def fetch_feed(source_name: str, url: str) -> list[dict]:
    """Parse a single RSS feed and return a list of article dicts."""
    print(f"  Fetching {source_name}...")
    feed = feedparser.parse(url)

    if feed.bozo and not feed.entries:
        print(f"    Warning: Could not parse {source_name} ({feed.bozo_exception})")
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(hours=HOURS_LOOKBACK)
    articles = []

    for entry in feed.entries[:MAX_ARTICLES_PER_FEED]:
        # Parse publication date (fall back to epoch if missing)
        pub_date = None
        for date_field in ("published", "updated"):
            raw = getattr(entry, date_field, None)
            if raw:
                try:
                    pub_date = dateparser.parse(raw)
                    if pub_date and pub_date.tzinfo is None:
                        pub_date = pub_date.replace(tzinfo=timezone.utc)
                    break
                except (ValueError, OverflowError):
                    pass

        if pub_date and pub_date < cutoff:
            continue  # Skip older articles

        title = entry.get("title", "").strip()
        summary = entry.get("summary", entry.get("description", "")).strip()
        summary = re.sub(r"<[^>]+>", " ", summary).strip()
        summary = re.sub(r"\s+", " ", summary)[:500]  # Truncate to 500 chars

        if title:
            articles.append({
                "source": source_name,
                "title": title,
                "summary": summary,
                "published": pub_date.isoformat() if pub_date else "unknown",
                "link": entry.get("link", ""),
            })

    print(f"    → {len(articles)} articles collected")
    return articles


def fetch_all_feeds() -> list[dict]:
    """Fetch all configured RSS feeds and return combined article list."""
    print(f"\n=== Step 1: Fetching RSS Feeds (last {HOURS_LOOKBACK}h) ===")
    all_articles = []
    for source, url in FEEDS.items():
        all_articles.extend(fetch_feed(source, url))
    print(f"\nTotal articles collected: {len(all_articles)}")
    return all_articles


# ─── Step 2: Claude API — Select & Summarize ──────────────────────────────────

SYSTEM_PROMPT = """You are the editorial AI behind "The Weekly Dose", a weekly English-language
news podcast. Your job is to:
1. Select the 15–18 most newsworthy, diverse, and interesting stories from the provided article list.
2. Write an engaging podcast script in English that:
   - Starts with an energetic intro (3–4 sentences) welcoming listeners to The Weekly Dose
     and teasing the biggest stories of the week.
   - Covers each selected story in a dedicated segment (4–6 sentences per story).
     Give context, explain why it matters, and keep it conversational.
   - Groups related stories naturally where it makes sense.
   - Includes 1–2 smooth transition phrases between segments to keep the flow going.
   - Ends with a warm outro (3–4 sentences) summarising the week and signing off.

Rules:
- Write in plain English — no markdown, no bullet points, no headers in the final script.
- Avoid technical jargon unless explained in plain terms.
- Do NOT mention article links or source URLs in the script.
- You may credit the news source (e.g., "according to NRK" or "The Verge reports").
- Target length: 1700–1900 words (approx. 11–13 minutes at normal speaking pace).
"""


def build_article_prompt(articles: list[dict]) -> str:
    """Format article list into a prompt for Claude."""
    lines = ["Here are the articles fetched from our RSS feeds:\n"]
    for i, a in enumerate(articles, 1):
        lines.append(f"[{i}] Source: {a['source']}")
        lines.append(f"    Title: {a['title']}")
        if a["summary"]:
            lines.append(f"    Summary: {a['summary']}")
        lines.append(f"    Published: {a['published']}")
        lines.append("")
    lines.append("Please select the best stories and write the podcast script.")
    return "\n".join(lines)


def generate_podcast_script(articles: list[dict]) -> str:
    """Send articles to Claude and get back a podcast script."""
    print("\n=== Step 2: Generating Podcast Script with Claude API ===")

    if not articles:
        raise ValueError("No articles to process — check your RSS feeds and time window.")

    client = anthropic.Anthropic()  # Reads ANTHROPIC_API_KEY from environment

    user_prompt = build_article_prompt(articles)

    print(f"Sending {len(articles)} articles to Claude...")

    with client.messages.stream(
        model="claude-opus-4-6",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        print("\n--- Podcast Script (streaming) ---\n")
        script_parts = []
        for text in stream.text_stream:
            print(text, end="", flush=True)
            script_parts.append(text)

    script = "".join(script_parts)
    print("\n\n--- End of Script ---")
    return script


# ─── Step 3: Text-to-Speech via OpenAI ───────────────────────────────────────

def split_into_chunks(text: str, max_chars: int = TTS_CHUNK_SIZE) -> list[str]:
    """
    Split text into chunks ≤ max_chars, breaking on sentence boundaries.
    Preserves whole sentences to avoid unnatural pauses mid-sentence.
    """
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        # If a single sentence exceeds the limit, hard-wrap it
        if len(sentence) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            for part in textwrap.wrap(sentence, max_chars):
                chunks.append(part)
        elif len(current) + len(sentence) + 1 <= max_chars:
            current = (current + " " + sentence).strip()
        else:
            chunks.append(current.strip())
            current = sentence

    if current:
        chunks.append(current.strip())

    return [c for c in chunks if c]


def text_to_speech(script: str, output_path: Path) -> Path:
    """Convert script to MP3 using OpenAI TTS. Chunks long scripts automatically."""
    print("\n=== Step 3: Converting Script to Audio (OpenAI TTS) ===")

    oai = OpenAI()  # Reads OPENAI_API_KEY from environment
    chunks = split_into_chunks(script)
    print(f"Script split into {len(chunks)} chunk(s) for TTS.")

    audio_parts: list[bytes] = []
    for i, chunk in enumerate(chunks, 1):
        print(f"  Synthesising chunk {i}/{len(chunks)} ({len(chunk)} chars)...")
        response = oai.audio.speech.create(
            model=TTS_MODEL,
            voice=TTS_VOICE,
            input=chunk,
            response_format="mp3",
        )
        audio_parts.append(response.content)

    # Concatenate raw MP3 bytes (valid for CBR streams; good enough for podcast use)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        for part in audio_parts:
            f.write(part)

    size_kb = output_path.stat().st_size // 1024
    print(f"  Audio saved to {output_path} ({size_kb} KB)")
    return output_path


# ─── Step 4: Upload to Buzzsprout ─────────────────────────────────────────────

def upload_to_buzzsprout(audio_path: Path, title: str, description: str) -> str:
    """Upload episode to Buzzsprout and return the episode URL."""
    print("\n=== Step 4: Uploading to Buzzsprout ===")

    api_token = os.environ.get("BUZZSPROUT_API_TOKEN")
    podcast_id = os.environ.get("BUZZSPROUT_PODCAST_ID")

    if not api_token or not podcast_id:
        print("  Buzzsprout credentials not set — skipping upload.")
        return ""

    url = f"https://www.buzzsprout.com/api/{podcast_id}/episodes.json"
    headers = {"Authorization": f"Token token={api_token}"}

    with open(audio_path, "rb") as f:
        response = requests.post(
            url,
            headers=headers,
            data={
                "title": title,
                "description": description,
                "private": 0,
            },
            files={"audio_file": (audio_path.name, f, "audio/mpeg")},
        )

    if response.ok:
        episode = response.json()
        episode_url = episode.get("audio_url", "")
        print(f"  Episode uploaded! URL: {episode_url}")
        return episode_url
    else:
        print(f"  Buzzsprout upload failed: {response.status_code} {response.text}")
        return ""


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Step 1: Fetch RSS feeds
    articles = fetch_all_feeds()

    if not articles:
        print("\nNo articles found. Try increasing HOURS_LOOKBACK or check feed URLs.")
        return

    # Save raw articles for inspection
    raw_path = OUTPUT_DIR / f"articles_raw_{timestamp}.json"
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)
    print(f"Raw articles saved to {raw_path}")

    # Step 2: Generate podcast script via Claude
    script = generate_podcast_script(articles)

    script_path = OUTPUT_DIR / f"podcast_script_{timestamp}.txt"
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(script)
    print(f"\nScript saved to {script_path}")

    # Step 3: Convert script to audio
    audio_path = OUTPUT_DIR / f"the_weekly_dose_{timestamp}.mp3"
    text_to_speech(script, audio_path)

    # Step 4: Upload to Buzzsprout
    episode_title = f"The Weekly Dose – {datetime.now().strftime('%d. %B %Y')}"
    episode_description = "Your weekly briefing on Norway, the world, and tech — in 20 minutes or less."
    episode_url = upload_to_buzzsprout(audio_path, episode_title, episode_description)

    print(f"\n✓ Done! Podcast ready: {audio_path}")
    if episode_url:
        print(f"✓ Live on Buzzsprout: {episode_url}")


if __name__ == "__main__":
    main()
