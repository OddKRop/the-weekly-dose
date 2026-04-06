# The Weekly Dose 🎙️

A fully automated weekly news podcast. Every Friday morning, a new episode is generated, published, and sent to subscribers — without any manual steps.

🎧 **[weeklydose.tech](https://www.weeklydose.tech)**

---

## How it works

Every Friday at 04:00 (Oslo time), a GitHub Actions workflow runs the full pipeline automatically:

```
RSS feeds (NRK, BBC, Bloomberg, TechCrunch m.fl.)
    ↓
Claude (script generation)
    ↓
OpenAI TTS (audio generation)
    ↓
GitHub Releases (audio hosting)
    ↓
Buzzsprout (podcast distribution → Spotify, Apple Podcasts)
    ↓
Buttondown (newsletter sent to subscribers)
```

---

## Repo structure

```
the-weekly-dose/
├── podcast-script/
│   ├── weekly_dose.py        # Main pipeline: RSS → Claude → TTS → newsletter content
│   ├── requirements.txt
│   └── output/               # Generated scripts, audio and newsletter.json
├── landing-page/             # Next.js app (weeklydose.tech)
│   └── app/
│       ├── page.tsx          # Landing page with subscribe form
│       └── api/
│           ├── subscribe/    # Adds email to Buttondown
│           └── publish-episode/  # Called by GitHub Actions; publishes to Buzzsprout + sends newsletter
└── .github/workflows/
    └── weekly_dose.yml       # Cron job + full pipeline orchestration
```

---

## Services

| Service | Purpose |
|---|---|
| Anthropic (Claude) | Generates podcast script from news articles |
| OpenAI TTS | Converts script to MP3 audio |
| GitHub Releases | Hosts the MP3 file |
| Buzzsprout | Podcast hosting, distributes to Spotify/Apple Podcasts |
| Buttondown | Newsletter/email subscriptions |
| Vercel | Hosts the Next.js landing page |

---

## Secrets & environment variables

### GitHub Secrets (for Actions)

| Secret | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI TTS key |
| `PUBLISH_TOKEN` | Shared secret for the `/api/publish-episode` endpoint |

### Vercel environment variables (for the landing page)

| Variable | Description |
|---|---|
| `BUZZSPROUT_API_TOKEN` | Buzzsprout API token |
| `BUZZSPROUT_PODCAST_ID` | Buzzsprout podcast ID |
| `BUTTONDOWN_API_KEY` | Buttondown API key |
| `PUBLISH_TOKEN` | Same shared secret as above |

---

## Local development

```bash
# Run the podcast pipeline locally
cd podcast-script
cp .env.example .env   # fill in ANTHROPIC_API_KEY and OPENAI_API_KEY
pip install -r requirements.txt
python weekly_dose.py
```

```bash
# Run the landing page locally
cd landing-page
npm install
npm run dev
```

---

## Manual episode trigger

The workflow can be triggered manually from GitHub:

**Actions → The Weekly Dose — Generate & Upload Episode → Run workflow**
