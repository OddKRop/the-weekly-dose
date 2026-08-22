#!/usr/bin/env bash
# Generates and publishes one episode of The Weekly Dose.
# Driven by the weekly-dose.timer systemd user unit on NEXUS1.
# Reads ANTHROPIC_API_KEY and PUBLISH_TOKEN from podcast-script/.env.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

VENV=".venv/bin/python"
if [[ ! -x "$VENV" ]]; then
    echo "Missing $VENV — create it with: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
    exit 1
fi

echo "=== The Weekly Dose — $(date '+%Y-%m-%d %H:%M') ==="

"$VENV" weekly_dose.py
"$VENV" publish.py

# Episodes live permanently on GitHub Releases, so local copies are only ever a
# working file. Pruning keeps this public repo's working tree from filling up with
# 9 MB MP3s that could be swept into a commit by a broad `git add`.
find output -name "the_weekly_dose_*.mp3" -mtime +30 -delete
find output -name "articles_raw_*.json" -mtime +30 -delete

echo "=== Done — $(date '+%H:%M') ==="
