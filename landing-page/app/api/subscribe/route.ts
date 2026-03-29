import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const res = await fetch("https://app.beehiiv.com/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email,
      publication_id: "019e1ef0-6a34-496f-9fd2-a1516478e545",
    }).toString(),
  });

  if (res.ok) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
