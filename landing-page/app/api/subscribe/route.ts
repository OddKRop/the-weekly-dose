import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/security/ratelimit";

// Ikke en fullstendig RFC 5322-sjekk — den er upraktisk og sier uansett ikke om
// adressen finnes. Formålet er å stoppe åpenbart søppel før det sendes videre
// til Buttondown, som er den eneste som kan avgjøre resten.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const MAX_EMAIL_LENGTH = 254;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip);

  if (!limit.ok) {
    const reset = limit.reset ?? Math.ceil((Date.now() + 60_000) / 1000);
    const retryAfter = Math.max(1, reset - Math.ceil(Date.now() / 1000));

    console.warn("[subscribe.rate_limited]", { ip, reason: limit.reason });

    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const body = payload as { email?: unknown; website?: unknown };

  // Honningkrukke: feltet er skjult i skjemaet, så et menneske fyller det aldri
  // ut. Vi later som det gikk bra i stedet for å avvise, slik at en bot ikke får
  // vite at den ble avslørt. Hjelper kun mot boter som fyller ut skjemaet — den
  // som POSTer rett mot endepunktet ser aldri feltet, og der er det rate limiten
  // som må ta jobben.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    console.warn("[subscribe.honeypot]", { ip });
    return NextResponse.json({ success: true });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const apiKey = process.env.BUTTONDOWN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    // Ingen `type` her, og det er med vilje. Buttondown bruker da standarden:
    // abonnenten får en bekreftelses-e-post og står som `unactivated` til hen
    // klikker. Sender man `type: "regular"`, hoppes bekreftelsen over — altså
    // dobbel opt-in avskrudd for hele skjemaet. Det ser ut som å fjerne unødig
    // friksjon, men er samtykket som forsvinner.
    //
    // Det er også dette som gjør at en bot forbi rate limiten ikke skitner til
    // lista: raden bekreftes aldri. Men merk at bekreftelsesmailen sendes
    // uansett, til adressen som ble oppgitt — så uten rate limiting kunne
    // skjemaet brukt nyhetsbrevet til å spamme tredjeparter.
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
