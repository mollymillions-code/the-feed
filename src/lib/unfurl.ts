import dns from "node:dns/promises";
import net from "node:net";
import { ContentType, UnfurlResult } from "@/types";

const MAX_REDIRECTS = 4;
const MAX_HTML_BYTES = 750_000;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const HOST_SAFETY_CACHE = new Map<string, boolean>();

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
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
  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
    return "youtube";
  }
  if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
    return "tweet";
  }
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

async function fetchWithSafety(url: string, init: RequestInit): Promise<Response> {
  let currentUrl = url;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const parsed = new URL(currentUrl);
    await assertSafeUrl(parsed);

    const response = await fetch(parsed.toString(), {
      ...init,
      redirect: "manual",
    });

    if (!isRedirect(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) return response;

    currentUrl = new URL(location, parsed).toString();
  }

  throw new Error("Too many redirects");
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

async function assertSafeUrl(url: URL): Promise<void> {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error("Only http/https URLs are allowed");
  }

  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed");
  }

  await assertPublicHostname(url.hostname);
}

async function assertPublicHostname(hostname: string): Promise<void> {
  const normalizedHost = hostname.toLowerCase();

  if (HOST_SAFETY_CACHE.has(normalizedHost)) {
    if (!HOST_SAFETY_CACHE.get(normalizedHost)) {
      throw new Error("Host blocked");
    }
    return;
  }

  if (isBlockedHostname(normalizedHost)) {
    HOST_SAFETY_CACHE.set(normalizedHost, false);
    throw new Error("Host blocked");
  }

  if (isIpLiteral(normalizedHost)) {
    const safe = !isPrivateIp(normalizedHost);
    HOST_SAFETY_CACHE.set(normalizedHost, safe);
    if (!safe) throw new Error("Private network targets are not allowed");
    return;
  }

  const addresses = await dns.lookup(normalizedHost, { all: true, verbatim: true });
  if (addresses.length === 0) {
    HOST_SAFETY_CACHE.set(normalizedHost, false);
    throw new Error("Host resolution failed");
  }

  const safe = addresses.every((addr) => !isPrivateIp(addr.address));
  HOST_SAFETY_CACHE.set(normalizedHost, safe);
  if (!safe) {
    throw new Error("Private network targets are not allowed");
  }
}

function isBlockedHostname(hostname: string): boolean {
  const blockedExact = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "metadata.google.internal",
    "169.254.169.254",
  ]);

  if (blockedExact.has(hostname)) return true;
  if (hostname.endsWith(".localhost")) return true;
  if (hostname.endsWith(".local")) return true;
  if (hostname.endsWith(".internal")) return true;
  return false;
}

function isIpLiteral(value: string): boolean {
  const withoutZone = value.split("%")[0];
  return net.isIP(withoutZone) !== 0;
}

function isPrivateIp(ipAddress: string): boolean {
  const ip = ipAddress.toLowerCase().split("%")[0];

  if (net.isIP(ip) === 4) {
    const n = ipv4ToInt(ip);
    return (
      inRange(n, "0.0.0.0", "0.255.255.255") ||
      inRange(n, "10.0.0.0", "10.255.255.255") ||
      inRange(n, "100.64.0.0", "100.127.255.255") ||
      inRange(n, "127.0.0.0", "127.255.255.255") ||
      inRange(n, "169.254.0.0", "169.254.255.255") ||
      inRange(n, "172.16.0.0", "172.31.255.255") ||
      inRange(n, "192.0.0.0", "192.0.0.255") ||
      inRange(n, "192.0.2.0", "192.0.2.255") ||
      inRange(n, "192.168.0.0", "192.168.255.255") ||
      inRange(n, "198.18.0.0", "198.19.255.255") ||
      inRange(n, "224.0.0.0", "239.255.255.255") ||
      inRange(n, "240.0.0.0", "255.255.255.255")
    );
  }

  if (net.isIP(ip) === 6) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // fc00::/7
    if (
      ip.startsWith("fe8") ||
      ip.startsWith("fe9") ||
      ip.startsWith("fea") ||
      ip.startsWith("feb")
    ) {
      return true; // fe80::/10
    }
    if (ip.startsWith("2001:db8")) return true; // documentation range

    if (ip.startsWith("::ffff:")) {
      const mapped = ip.slice(7);
      if (net.isIP(mapped) === 4) return isPrivateIp(mapped);
    }
  }

  return false;
}

function ipv4ToInt(ipv4: string): number {
  const parts = ipv4.split(".").map((part) => Number.parseInt(part, 10));
  return (
    (((parts[0] << 24) >>> 0) +
      ((parts[1] << 16) >>> 0) +
      ((parts[2] << 8) >>> 0) +
      (parts[3] >>> 0)) >>>
    0
  );
}

function inRange(ip: number, start: string, end: string): boolean {
  return ip >= ipv4ToInt(start) && ip <= ipv4ToInt(end);
}

function fallbackResult(url: string, contentType: ContentType, metadata: Record<string, unknown>): UnfurlResult {
  return {
    title: null,
    description: null,
    thumbnail: null,
    siteName: new URL(url).hostname.replace("www.", ""),
    contentType,
    metadata,
  };
}

export async function unfurlUrl(url: string): Promise<UnfurlResult> {
  const parsed = new URL(url);
  await assertSafeUrl(parsed);

  const normalizedUrl = parsed.toString();
  const contentType = detectContentType(normalizedUrl);
  const metadata: Record<string, unknown> = {};

  if (contentType === "youtube") {
    const videoId = extractYouTubeId(normalizedUrl);
    if (videoId) {
      metadata.videoId = videoId;
      try {
        const oembedRes = await fetchWithSafety(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          }
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

  try {
    const res = await fetchWithSafety(normalizedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TheFeedBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return fallbackResult(normalizedUrl, contentType, metadata);
    }

    const contentHeader = res.headers.get("content-type") || "";
    if (!contentHeader.toLowerCase().includes("text/html")) {
      return fallbackResult(normalizedUrl, contentType, metadata);
    }

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);

    const getMetaContent = (property: string): string | null => {
      const patterns = [
        new RegExp(
          `<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`,
          "i"
        ),
        new RegExp(
          `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`,
          "i"
        ),
        new RegExp(
          `<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`,
          "i"
        ),
        new RegExp(
          `<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`,
          "i"
        ),
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) return match[1];
      }
      return null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const rawTitle =
      getMetaContent("og:title") ||
      getMetaContent("twitter:title") ||
      (titleMatch ? titleMatch[1] : null);
    const rawDescription =
      getMetaContent("og:description") ||
      getMetaContent("twitter:description") ||
      getMetaContent("description");
    const rawThumbnail =
      getMetaContent("og:image") || getMetaContent("twitter:image");
    const rawSiteName =
      getMetaContent("og:site_name") || parsed.hostname.replace("www.", "");

    return {
      title: rawTitle ? decodeHtmlEntities(rawTitle) : null,
      description: rawDescription ? decodeHtmlEntities(rawDescription) : null,
      thumbnail: rawThumbnail ? decodeHtmlEntities(rawThumbnail) : null,
      siteName: rawSiteName ? decodeHtmlEntities(rawSiteName) : null,
      contentType,
      metadata,
    };
  } catch {
    return fallbackResult(normalizedUrl, contentType, metadata);
  }
}
