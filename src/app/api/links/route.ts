import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { links } from "@/lib/db/schema";
import { unfurlUrl } from "@/lib/unfurl";
import { categorizeContent, generateEmbedding } from "@/lib/ai";
import { nanoid } from "nanoid";
import { desc, eq, count, sql } from "drizzle-orm";

// GET /api/links — list all links (with optional status filter)
// ?stats=true returns counts + categories without fetching all rows
export async function GET(request: NextRequest) {
  const wantStats = request.nextUrl.searchParams.get("stats") === "true";

  if (wantStats) {
    const [activeCount] = await db.select({ count: count() }).from(links).where(eq(links.status, "active"));
    const [archivedCount] = await db.select({ count: count() }).from(links).where(eq(links.status, "archived"));
    const catRows = await db.select({ categories: links.categories }).from(links).where(sql`${links.categories} is not null`);
    const categorySet = new Set<string>();
    catRows.forEach((row) => {
      if (row.categories) row.categories.forEach((c) => categorySet.add(c));
    });
    return NextResponse.json({
      active: activeCount.count,
      archived: archivedCount.count,
      total: activeCount.count + archivedCount.count,
      categories: Array.from(categorySet).sort(),
    });
  }

  const status = request.nextUrl.searchParams.get("status") || "active";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");

  const result = await db
    .select()
    .from(links)
    .where(eq(links.status, status))
    .orderBy(desc(links.addedAt))
    .limit(limit);

  return NextResponse.json(result);
}

// POST /api/links — add a new link
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { url } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Check for duplicates
  const existing = await db
    .select()
    .from(links)
    .where(eq(links.url, url))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Link already exists", link: existing[0] },
      { status: 409 }
    );
  }

  // Unfurl metadata
  const unfurled = await unfurlUrl(url);

  // AI categorization
  const aiResult = await categorizeContent(
    unfurled.title,
    unfurled.description,
    unfurled.siteName,
    unfurled.contentType
  );

  // Generate semantic embedding (runs in parallel with nothing — but we need
  // the categories from above, so it's sequential)
  const embedding = await generateEmbedding(
    unfurled.title,
    unfurled.description,
    aiResult.categories,
    unfurled.siteName
  );

  const id = nanoid(12);

  const [newLink] = await db
    .insert(links)
    .values({
      id,
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
    })
    .returning();

  return NextResponse.json(newLink, { status: 201 });
}
