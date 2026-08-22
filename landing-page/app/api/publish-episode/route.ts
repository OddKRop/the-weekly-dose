import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Verify secret token
  const token = req.headers.get("x-publish-token");
  if (token !== process.env.PUBLISH_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    audio_url,
    title,
    newsletter_subject,
    newsletter_bullets,
    newsletter_ending,
    // Recovery path for when the episode published but the newsletter did not: without
    // it, retrying the mail means publishing a duplicate episode to Buzzsprout.
    newsletter_only = false,
  } = await req.json();

  if (!newsletter_only && (!audio_url || !title)) {
    return NextResponse.json({ error: "Missing audio_url or title" }, { status: 400 });
  }

  const apiToken = process.env.BUZZSPROUT_API_TOKEN;
  const podcastId = process.env.BUZZSPROUT_PODCAST_ID;

  if (!newsletter_only && (!apiToken || !podcastId)) {
    return NextResponse.json({ error: "Buzzsprout credentials not configured" }, { status: 500 });
  }

  // ── Publish to Buzzsprout ──────────────────────────────────────────────────
  const response = newsletter_only ? null : await fetch(
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

  const data = response ? await response.json() : null;

  if (response && !response.ok) {
    return NextResponse.json(
      { error: "Buzzsprout error", details: data },
      { status: response.status }
    );
  }

  const episodeUrl = "https://open.spotify.com/show/3Ucf7fHQ2YGwLHrnDQM5bs";

  // ── Send newsletter via Buttondown ─────────────────────────────────────────
  let newsletterResult: { status: number; ok: boolean; detail?: string } | null = null;

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
        // Buttondown's 2026-04-01 API version defaults new emails to draft, and refuses
        // status "about_to_send" with 400 sending_requires_confirmation unless this header
        // is present. It is a one-time confirmation per API key, but sending it on every
        // request costs nothing and survives a key rotation. This is what silently swallowed
        // the newsletter on 2026-08-22.
        "X-Buttondown-Live-Dangerously": "true",
      },
      body: JSON.stringify({
        subject: newsletter_subject,
        body,
        status: "about_to_send",
      }),
    });

    newsletterResult = { status: bdRes.status, ok: bdRes.ok };

    if (!bdRes.ok) {
      // Return the reason, not just the status. When this failed silently, the only
      // record of why was a console line in the Vercel runtime logs.
      const detail = await bdRes.text();
      console.error("Buttondown error:", bdRes.status, detail);
      newsletterResult = { ...newsletterResult, detail: detail.slice(0, 500) };
    }
  }

  return NextResponse.json({
    success: true,
    episode: data,
    episode_url: episodeUrl,
    newsletter: newsletterResult,
  });
}
