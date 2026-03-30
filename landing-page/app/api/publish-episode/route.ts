import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Verify secret token
  const token = req.headers.get("x-publish-token");
  if (token !== process.env.PUBLISH_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { audio_url, title } = await req.json();

  if (!audio_url || !title) {
    return NextResponse.json(
      { error: "Missing audio_url or title" },
      { status: 400 }
    );
  }

  const apiToken = process.env.BUZZSPROUT_API_TOKEN;
  const podcastId = process.env.BUZZSPROUT_PODCAST_ID;

  if (!apiToken || !podcastId) {
    return NextResponse.json(
      { error: "Buzzsprout credentials not configured" },
      { status: 500 }
    );
  }

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

  return NextResponse.json({ success: true, episode: data });
}
