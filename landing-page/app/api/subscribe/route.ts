import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const apiKey = process.env.BUTTONDOWN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.buttondown.email/v1/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify({ email_address: email }),
    });

    if (res.ok) {
      return NextResponse.json({ success: true });
    }

    const text = await res.text();
    console.error("Buttondown error:", res.status, text);
    return NextResponse.json({ error: "Buttondown error" }, { status: 500 });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
