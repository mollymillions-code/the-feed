import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { links } from "@/lib/db/schema";
import { categorizeContent, generateEmbedding } from "@/lib/ai";
import { nanoid } from "nanoid";
import { getSession } from "@/lib/auth";

/**
 * POST /api/upload — Add image or text content (not a URL)
 *
 * Body:
 * - type: "image" | "text"
 * - title: optional title
 * - textContent: for text type, the actual content
 * - imageData: for image type, base64 data URI
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session.userId!;

  const body = await request.json();
  const { type, title, textContent, imageData } = body;

  if (type === "image" && !imageData) {
    return NextResponse.json({ error: "Image data required" }, { status: 400 });
  }

  if (type === "text" && !textContent) {
    return NextResponse.json({ error: "Text content required" }, { status: 400 });
  }

  // AI categorization based on available content
  const categorizeTitle = title || (type === "text" ? textContent?.slice(0, 100) : "Uploaded image");
  const categorizeDesc = type === "text" ? textContent : title || "Image screenshot";

  const aiResult = await categorizeContent(
    categorizeTitle,
    categorizeDesc,
    null,
    type
  );

  const embedding = await generateEmbedding(
    categorizeTitle,
    categorizeDesc,
    aiResult.categories,
    null
  );

  const id = nanoid(12);

  const [newLink] = await db
    .insert(links)
    .values({
      id,
      userId,
      url: null,
      title: title || (type === "text" ? textContent?.slice(0, 80) : "Image"),
      description: type === "text" ? textContent?.slice(0, 200) : null,
      thumbnail: type === "image" ? imageData : null,
      siteName: null,
      contentType: type,
      textContent: type === "text" ? textContent : null,
      imageData: type === "image" ? imageData : null,
      categories: aiResult.categories,
      aiSummary: aiResult.summary,
      status: "active",
      metadata: null,
      embedding,
    })
    .returning();

  return NextResponse.json(newLink, { status: 201 });
}

/**
 * POST /api/upload/bulk — Mass add multiple links at once
 */
export async function PUT(request: NextRequest) {
  const session = await getSession();
  const userId = session.userId!;

  const body = await request.json();
  const { urls } = body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls array required" }, { status: 400 });
  }

  // Cap at 50 links per batch
  const batch = urls.slice(0, 50);
  const results: { url: string; status: "added" | "duplicate" | "error" }[] = [];

  // Import dynamically to avoid circular deps
  const { unfurlUrl } = await import("@/lib/unfurl");

  for (const url of batch) {
    try {
      // Validate
      new URL(url);

      // Check duplicate (per user)
      const { eq, and } = await import("drizzle-orm");
      const existing = await db
        .select({ id: links.id })
        .from(links)
        .where(and(eq(links.url, url), eq(links.userId, userId)))
        .limit(1);

      if (existing.length > 0) {
        results.push({ url, status: "duplicate" });
        continue;
      }

      // Unfurl
      const unfurled = await unfurlUrl(url);
      const aiResult = await categorizeContent(
        unfurled.title,
        unfurled.description,
        unfurled.siteName,
        unfurled.contentType
      );
      const embedding = await generateEmbedding(
        unfurled.title,
        unfurled.description,
        aiResult.categories,
        unfurled.siteName
      );

      await db.insert(links).values({
        id: nanoid(12),
        userId,
        url,
        title: unfurled.title,
        description: unfurled.description,
        thumbnail: unfurled.thumbnail,
        siteName: unfurled.siteName,
        contentType: unfurled.contentType,
        categories: aiResult.categories,
        aiSummary: aiResult.summary,
        status: "active",
        metadata: unfurled.metadata,
        embedding,
      });

      results.push({ url, status: "added" });
    } catch {
      results.push({ url, status: "error" });
    }
  }

  const added = results.filter((r) => r.status === "added").length;
  const duplicates = results.filter((r) => r.status === "duplicate").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ results, summary: { added, duplicates, errors } });
}
