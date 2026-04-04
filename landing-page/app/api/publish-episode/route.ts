import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Verify secret token
  const token = req.headers.get("x-publish-token");
  if (token !== process.env.PUBLISH_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { audio_url, title, newsletter_subject, newsletter_bullets, newsletter_ending } =
    await req.json();

  if (!audio_url || !title) {
    return NextResponse.json({ error: "Missing audio_url or title" }, { status: 400 });
  }

  const apiToken = process.env.BUZZSPROUT_API_TOKEN;
  const podcastId = process.env.BUZZSPROUT_PODCAST_ID;

  if (!apiToken || !podcastId) {
    return NextResponse.json({ error: "Buzzsprout credentials not configured" }, { status: 500 });
  }

  // ── Publish to Buzzsprout ──────────────────────────────────────────────────
  const response = await fetch(
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
        description:
          "Your weekly briefing on Norway, the world, and tech — in 20 minutes or less.",
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: "Buzzsprout error", details: data },
      { status: response.status }
    );
  }

  const episodeUrl = `https://www.buzzsprout.com/${podcastId}/${data.id}`;

  // ── Send newsletter via Buttondown ─────────────────────────────────────────
  let newsletterResult: { status: number; ok: boolean } | null = null;

  if (newsletter_subject && newsletter_bullets && process.env.BUTTONDOWN_API_KEY) {
    const bullets = (newsletter_bullets as string[]).map((b) => `- ${b}`).join("\n");
    const ending = newsletter_ending ? `\n${newsletter_ending}\n` : "";

    const body = `Hey!

This week's episode of The Weekly Dose is out now — and it's a packed one.
Here's a taste of what we're covering:

${bullets}
${ending}
All that and more — in 20 minutes or less.

👉 [Listen to this week's episode here](${episodeUrl})

Have a great weekend,
The Weekly Dose`;

    const bdRes = await fetch("https://api.buttondown.email/v1/emails", {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.BUTTONDOWN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: newsletter_subject,
        body,
        status: "about_to_send",
      }),
    });

    newsletterResult = { status: bdRes.status, ok: bdRes.ok };

    if (!bdRes.ok) {
      console.error("Buttondown error:", bdRes.status, await bdRes.text());
    }
  }

  return NextResponse.json({
    success: true,
    episode: data,
    episode_url: episodeUrl,
    newsletter: newsletterResult,
  });
}
