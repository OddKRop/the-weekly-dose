import { NextRequest, NextResponse } from "next/server";

const BEEHIIV_PUB_ID = "pub_019e1ef0-6a34-496f-9fd2-a1516478e545";

function buildEmailHtml(title: string, script: string, episodeUrl: string): string {
  const paragraphs = script
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.7;">${p.trim()}</p>`)
    .join("");

  return `
    <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;color:#1a1a1a;">
      <h1 style="font-size:24px;font-weight:bold;margin:0 0 8px 0;">${title}</h1>
      <p style="color:#666;margin:0 0 24px 0;">Your weekly briefing on Norway, the world, and tech.</p>

      <a href="${episodeUrl}"
         style="display:inline-block;background:#000;color:#fff;padding:12px 24px;
                border-radius:6px;text-decoration:none;font-family:sans-serif;
                font-size:15px;margin-bottom:32px;">
        🎙️ Listen to this week's episode
      </a>

      <hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 32px 0;" />

      <h2 style="font-size:18px;margin:0 0 16px 0;">This week's stories</h2>
      ${paragraphs}

      <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px 0;" />
      <p style="font-size:13px;color:#999;font-family:sans-serif;">
        You're receiving this because you subscribed to The Weekly Dose.
      </p>
    </div>
  `;
}

export async function POST(req: NextRequest) {
  // Verify secret token
  const token = req.headers.get("x-publish-token");
  if (token !== process.env.PUBLISH_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { audio_url, title, script } = await req.json();

  if (!audio_url || !title) {
    return NextResponse.json({ error: "Missing audio_url or title" }, { status: 400 });
  }

  const apiToken = process.env.BUZZSPROUT_API_TOKEN;
  const podcastId = process.env.BUZZSPROUT_PODCAST_ID;

  if (!apiToken || !podcastId) {
    return NextResponse.json({ error: "Buzzsprout credentials not configured" }, { status: 500 });
  }

  // ── Step 1: Publish to Buzzsprout ──────────────────────────────────────────
  const buzzResponse = await fetch(
    `https://www.buzzsprout.com/api/${podcastId}/episodes.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Token token=${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        audio_url,
        private: 0,
        description: "Your weekly briefing on Norway, the world, and tech — in 20 minutes or less.",
      }),
    }
  );

  const buzzData = await buzzResponse.json();

  if (!buzzResponse.ok) {
    return NextResponse.json({ error: "Buzzsprout error", details: buzzData }, { status: buzzResponse.status });
  }

  const episodeId = buzzData.id;
  const episodeUrl = `https://www.buzzsprout.com/${podcastId}/${episodeId}`;

  // ── Step 2: Send Beehiiv newsletter ────────────────────────────────────────
  const beehiivKey = process.env.BEEHIIV_API_KEY;

  if (beehiivKey && script) {
    const contentHtml = buildEmailHtml(title, script, episodeUrl);

    const beehiivResponse = await fetch(
      `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB_ID}/posts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${beehiivKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          subtitle: "Your weekly briefing on Norway, the world, and tech.",
          content_html: contentHtml,
          status: "confirmed",
          audience: "free",
        }),
      }
    );

    const beehiivData = await beehiivResponse.json();
    console.log("Beehiiv response:", beehiivResponse.status, JSON.stringify(beehiivData));
  }

  return NextResponse.json({ success: true, episode: buzzData, episode_url: episodeUrl });
}
