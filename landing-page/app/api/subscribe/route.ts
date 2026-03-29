import { NextRequest, NextResponse } from "next/server";

const PUBLICATION_ID = "pub_019e1ef0-6a34-496f-9fd2-a1516478e545";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const apiKey = process.env.BEEHIIV_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/subscriptions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          email,
          reactivate_existing: false,
          send_welcome_email: true,
        }),
      }
    );

    if (res.ok) {
      return NextResponse.json({ success: true });
    }

    const text = await res.text();
    console.error("Beehiiv error:", res.status, text);
    return NextResponse.json({ error: "Beehiiv error" }, { status: 500 });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
