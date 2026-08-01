import "server-only";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Et menneske melder seg på én gang. Grensene er satt slik at en person som
// skriver feil e-post et par ganger ikke merker dem.
const MAX_PER_MINUTE = 3;
const MAX_PER_DAY = 10;

// Uten IP kan vi ikke skille to besøkende fra hverandre, så alle deler én
// kvote. Den er strengere, ellers ville den vært en gratis omvei.
const UNKNOWN_MAX_PER_MINUTE = 2;
const UNKNOWN_MAX_PER_DAY = 5;

const SWEEP_THRESHOLD = 5_000;

type RateLimitResult = {
  ok: boolean;
  reason?: "minute" | "day";
  reset?: number;
};

/**
 * Tellingen ligger i prosessminnet.
 *
 * På Vercel kjører ruten serverless: minnet følger den enkelte instansen, det
 * forsvinner ved kaldstart, og to samtidige instanser deler ikke tilstand.
 * Grensen er derfor ikke en garanti — den gjør naiv misbruk merkbart dyrere,
 * ikke umulig. Det er riktig avveining her: endepunktet videresender kun til
 * Buttondown, og et delt lager (Redis e.l.) ville betydd enda en tjeneste å
 * drifte for en side som får noen påmeldinger i uka.
 *
 * Blir dette utilstrekkelig, er tegnet at Buttondown-lista fylles med adresser
 * som aldri bekrefter. Da er delt lager — eller Buttondowns egen dobbel
 * opt-in — neste steg, ikke strengere tall her.
 */
const hits = new Map<string, number[]>();

function limitsFor(ip: string) {
  return ip === "unknown"
    ? { perMinute: UNKNOWN_MAX_PER_MINUTE, perDay: UNKNOWN_MAX_PER_DAY }
    : { perMinute: MAX_PER_MINUTE, perDay: MAX_PER_DAY };
}

// Rydder nøkler uten trafikk det siste døgnet, og bare når kartet har vokst,
// slik at vanlige forespørsler forblir O(1).
function sweep(now: number): void {
  for (const [key, timestamps] of hits) {
    const newest = timestamps[timestamps.length - 1];
    if (newest === undefined || now - newest >= DAY_MS) {
      hits.delete(key);
    }
  }
}

/**
 * Klientens IP.
 *
 * Vercel skriver over x-forwarded-for med den faktiske klient-IP-en, så første
 * element kan stoles på her. Merk at dette *ikke* gjelder bak Cloudflare, som
 * legger klientens IP bakerst og lar en klientsatt XFF stå først — der må
 * cf-connecting-ip brukes. Flyttes siden noen gang bak Cloudflare Tunnel, må
 * denne funksjonen endres, ellers omgås grensen med en tilfeldig header.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstIp = forwardedFor?.split(",")[0]?.trim();
  if (firstIp) {
    return firstIp;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const key = ip === "unknown" ? "unknown-ip" : ip;
  const { perMinute, perDay } = limitsFor(ip);

  if (hits.size > SWEEP_THRESHOLD) {
    sweep(now);
  }

  // Bare innvilgede forespørsler telles, så lista kan aldri bli lengre enn
  // dagskvoten. Avviste forespørsler bruker ikke opp kvote.
  const timestamps = (hits.get(key) ?? []).filter(
    (timestamp) => now - timestamp < DAY_MS
  );

  const withinMinute = timestamps.filter((timestamp) => now - timestamp < MINUTE_MS);

  if (withinMinute.length >= perMinute) {
    return {
      ok: false,
      reason: "minute",
      reset: Math.ceil((withinMinute[0] + MINUTE_MS) / 1000),
    };
  }

  if (timestamps.length >= perDay) {
    return {
      ok: false,
      reason: "day",
      reset: Math.ceil((timestamps[0] + DAY_MS) / 1000),
    };
  }

  timestamps.push(now);
  hits.set(key, timestamps);

  return { ok: true };
}
