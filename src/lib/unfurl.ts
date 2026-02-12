import { ContentType, UnfurlResult } from "@/types";

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function detectContentType(url: string): ContentType {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "youtube";
  if (hostname.includes("twitter.com") || hostname.includes("x.com")) return "tweet";
  if (hostname.includes("instagram.com")) return "instagram";
  return "article";
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function unfurlUrl(url: string): Promise<UnfurlResult> {
  const contentType = detectContentType(url);
  const metadata: Record<string, unknown> = {};

  // For YouTube, use oEmbed API (no auth needed)
  if (contentType === "youtube") {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      metadata.videoId = videoId;
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          return {
            title: data.title || null,
            description: null,
            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            siteName: data.author_name || "YouTube",
            contentType,
            metadata: { ...metadata, authorName: data.author_name },
          };
        }
      } catch {
        // Fall through to generic unfurl
      }
    }
  }

  // Generic OG tag extraction via fetch + regex
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TheFeedBot/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    const html = await res.text();

    const getMetaContent = (property: string): string | null => {
      // Match both property= and name= attributes
      const patterns = [
        new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"),
        new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, "i"),
        new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"),
        new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`, "i"),
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) return match[1];
      }
      return null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

    const rawTitle = getMetaContent("og:title") || getMetaContent("twitter:title") || (titleMatch ? titleMatch[1] : null);
    const rawDescription = getMetaContent("og:description") || getMetaContent("twitter:description") || getMetaContent("description");
    const rawThumbnail = getMetaContent("og:image") || getMetaContent("twitter:image");
    const rawSiteName = getMetaContent("og:site_name") || new URL(url).hostname.replace("www.", "");

    return {
      title: rawTitle ? decodeHtmlEntities(rawTitle) : null,
      description: rawDescription ? decodeHtmlEntities(rawDescription) : null,
      thumbnail: rawThumbnail ? decodeHtmlEntities(rawThumbnail) : null,
      siteName: rawSiteName ? decodeHtmlEntities(rawSiteName) : null,
      contentType,
      metadata,
    };
  } catch {
    return {
      title: null,
      description: null,
      thumbnail: null,
      siteName: new URL(url).hostname.replace("www.", ""),
      contentType,
      metadata,
    };
  }
}
