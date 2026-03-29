import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    const res = await fetch(
      "https://embeds.beehiiv.com/api/v1/publications/019e1ef0-6a34-496f-9fd2-a1516478e545/subscriptions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }
    );

    const text = await res.text();
    console.log("Beehiiv response status:", res.status);
    console.log("Beehiiv response body:", text);

    if (res.ok) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Beehiiv error", status: res.status, body: text }, { status: 500 });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
