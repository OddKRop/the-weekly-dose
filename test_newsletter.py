"""
Testscript for Buttondown-integrasjon.
Oppretter en draft-e-post i Buttondown uten å sende til subscribers.
Kjør: python test_newsletter.py
"""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "podcast-script", ".env"))

BUTTONDOWN_API_KEY = os.environ.get("BUTTONDOWN_API_KEY")
if not BUTTONDOWN_API_KEY:
    print("❌ BUTTONDOWN_API_KEY ikke satt. Legg den i en .env-fil eller som env-variabel.")
    exit(1)

# --- Test-data (samme format som den ekte flyten genererer) ---
subject = "This week: Test, Buttondown, and Automated Newsletters"
bullets = [
    "🧪 Dette er en test-e-post — ingen ekte nyheter denne uken",
    "🤖 Nyhetsbrevet sendes nå automatisk hver torsdag kveld",
    "📬 Buttondown håndterer utsendelsen fra nå av",
    "✅ Dersom du ser denne som draft i Buttondown, fungerer alt som det skal",
]
ending = "...and the newsletter finally sends itself. Yes, really."
episode_url = "https://open.spotify.com/show/3Ucf7fHQ2YGwLHrnDQM5bs"

bullets_md = "\n".join(f"- {b}" for b in bullets)
body = f"""Hey!

This week's episode of The Weekly Dose is out now — and it's a packed one.
Here's a taste of what we're covering:

{bullets_md}

{ending}

All that and more — in 20 minutes or less.

👉 [Listen to this week's episode here]({episode_url})

Have a great weekend,
The Weekly Dose"""

# --- Kall Buttondown API ---
print("Sender test-draft til Buttondown...")
res = requests.post(
    "https://api.buttondown.email/v1/emails",
    headers={
        "Authorization": f"Token {BUTTONDOWN_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "subject": subject,
        "body": body,
        "status": "draft",  # Sendes IKKE til subscribers
    },
)

print(f"Status: {res.status_code}")
if res.ok:
    data = res.json()
    print(f"✅ Draft opprettet i Buttondown!")
    print(f"   ID: {data.get('id')}")
    print(f"   Emne: {data.get('subject')}")
    print(f"\nÅpne Buttondown-dashbordet og sjekk under 'Drafts' for å se e-posten.")
else:
    print(f"❌ Feil: {res.text}")
