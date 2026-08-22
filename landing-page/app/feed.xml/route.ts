import legacyGuids from "./legacy-guids.json";

// The podcast RSS feed. Episodes are read straight from GitHub Releases, which is
// where the MP3s already live permanently and for free — no database to keep in sync,
// and the archive outlives whichever podcast host we happen to use.
//
// Revalidated hourly: podcast clients poll often, and the GitHub API allows only 60
// unauthenticated requests per hour. Set GITHUB_TOKEN in Vercel to raise that to 5000.

export const revalidate = 3600;

const REPO = process.env.PODCAST_REPO ?? "OddKRop/the-weekly-dose";
const SITE = "https://www.weeklydose.tech";

const CHANNEL = {
  title: "The Weekly Dose",
  description:
    "The Weekly Dose is a short podcast that gives you the most important stories in AI, tech, Norwegian and global news – in 20 minutes or less. Just the essentials, delivered every Friday morning.",
  author: "Odd Karsten",
  language: "en-us",
  copyright: "© 2026 The Weekly Dose",
  image: `${SITE}/podcast-cover.jpg`,
  // Carried over from the Buzzsprout feed so podcast directories recognise this as the
  // same show after the move, rather than listing it as a brand new podcast.
  podcastGuid: "f20c1260-6cbc-5828-8cb3-805b78499244",
};

const EPISODE_BLURB =
  "Your weekly briefing on Norway, the world, and tech — in 20 minutes or less.";

type Release = {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string;
  assets: { name: string; size: number; browser_download_url: string }[];
};

type LegacyEntry = { guid: string; pubDate: string };

const legacy = legacyGuids as Record<string, LegacyEntry>;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]&gt;")}]]>`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Release notes carry a trailing `<!-- weekly-dose-meta: {...} -->` comment written by publish.py. */
function parseNotes(body: string | null): { description: string; duration?: number } {
  if (!body) return { description: EPISODE_BLURB };

  const match = body.match(/<!--\s*weekly-dose-meta:\s*(\{[\s\S]*?\})\s*-->/);
  let duration: number | undefined;
  if (match) {
    try {
      const meta = JSON.parse(match[1]);
      if (typeof meta.duration === "number") duration = meta.duration;
    } catch {
      // A malformed comment should cost us the duration tag, not the whole feed.
    }
  }

  const description = body.replace(/<!--\s*weekly-dose-meta:[\s\S]*?-->/, "").trim();
  // Episodes published before this feed existed just say "Auto-generated episode".
  const usable = description && description !== "Auto-generated episode";
  return { description: usable ? description : EPISODE_BLURB, duration };
}

async function fetchReleases(): Promise<Release[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "weekly-dose-feed",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases?per_page=100`,
    { headers, next: { revalidate } }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json();
}

function renderItem(release: Release): string | null {
  const mp3 = release.assets.find((a) => a.name.toLowerCase().endsWith(".mp3"));
  if (!mp3) return null; // A release without audio is not an episode.

  const title = release.name?.trim() || release.tag_name;
  const { description, duration } = parseNotes(release.body);
  const known = legacy[title];

  // Keeping the Buzzsprout GUID means subscribers do not get the last few episodes
  // re-delivered as new when the feed moves.
  const guid = known?.guid ?? `weeklydose-${release.tag_name}`;
  const pubDate = known?.pubDate ?? new Date(release.published_at).toUTCString();

  return `  <item>
    <title>${escapeXml(title)}</title>
    <itunes:title>${escapeXml(title)}</itunes:title>
    <description>${cdata(description)}</description>
    <itunes:summary>${cdata(description)}</itunes:summary>
    <content:encoded>${cdata(description)}</content:encoded>
    <enclosure url="${escapeXml(mp3.browser_download_url)}" length="${mp3.size}" type="audio/mpeg" />
    <guid isPermaLink="false">${escapeXml(guid)}</guid>
    <pubDate>${escapeXml(pubDate)}</pubDate>
    <itunes:author>${escapeXml(CHANNEL.author)}</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:episodeType>full</itunes:episodeType>${
      duration ? `\n    <itunes:duration>${formatDuration(duration)}</itunes:duration>` : ""
    }
    <link>${SITE}</link>
  </item>`;
}

export async function GET() {
  const releases = await fetchReleases();
  const items = releases
    .sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at))
    .map(renderItem)
    .filter((item): item is string => item !== null)
    .join("\n");

  const ownerEmail = process.env.PODCAST_OWNER_EMAIL;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:podcast="https://podcastindex.org/namespace/1.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
  <title>${escapeXml(CHANNEL.title)}</title>
  <link>${SITE}</link>
  <language>${CHANNEL.language}</language>
  <copyright>${escapeXml(CHANNEL.copyright)}</copyright>
  <description>${cdata(CHANNEL.description)}</description>
  <podcast:guid>${CHANNEL.podcastGuid}</podcast:guid>
  <itunes:author>${escapeXml(CHANNEL.author)}</itunes:author>
  <itunes:type>episodic</itunes:type>
  <itunes:explicit>false</itunes:explicit>
  <itunes:summary>${cdata(CHANNEL.description)}</itunes:summary>
  <itunes:owner>
    <itunes:name>${escapeXml(CHANNEL.author)}</itunes:name>${
      ownerEmail ? `\n    <itunes:email>${escapeXml(ownerEmail)}</itunes:email>` : ""
    }
  </itunes:owner>
  <image>
    <url>${CHANNEL.image}</url>
    <title>${escapeXml(CHANNEL.title)}</title>
    <link>${SITE}</link>
  </image>
  <itunes:image href="${CHANNEL.image}" />
  <itunes:category text="News">
    <itunes:category text="Tech News" />
  </itunes:category>
${items}
</channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
