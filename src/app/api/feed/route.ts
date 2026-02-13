import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { links, timePreferences } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { scoreFeedLinks, SessionContext, TimePreference } from "@/lib/feed-algorithm";
import { FeedLink } from "@/types";
import { decodeEntities } from "@/lib/utils";
import { getSession } from "@/lib/auth";

// GET /api/feed — get smart-ordered feed with full recommendation engine
export async function GET(request: NextRequest) {
  const authSession = await getSession();
  const userId = authSession.userId!;
  const category = request.nextUrl.searchParams.get("category") || "All";
  const parsedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "20", 10);
  const parsedOffset = Number.parseInt(request.nextUrl.searchParams.get("offset") || "0", 10);
  const limit = Number.isNaN(parsedLimit) ? 20 : Math.max(1, Math.min(parsedLimit, 50));
  const offset = Number.isNaN(parsedOffset) ? 0 : Math.max(0, parsedOffset);
  const excludeIds = request.nextUrl.searchParams.get("excludeIds")?.split(",").filter(Boolean) || [];

  // Session context from query params (sent by the client)
  const engagedIds = request.nextUrl.searchParams.get("engagedIds")?.split(",").filter(Boolean) || [];
  const engagedCats = request.nextUrl.searchParams.get("engagedCats")?.split(",").filter(Boolean) || [];
  const skippedCats = request.nextUrl.searchParams.get("skippedCats")?.split(",").filter(Boolean) || [];
  const cardsShown = Number.parseInt(request.nextUrl.searchParams.get("cardsShown") || "0", 10) || 0;

  const activeWhere = and(eq(links.status, "active"), eq(links.userId, userId));
  const filteredWhere = category === "All"
    ? activeWhere
    : and(activeWhere, sql`${category} = ANY(${links.categories})`);

  const [filteredLinks, categoryRows, engagedRows] = await Promise.all([
    db.select().from(links).where(filteredWhere),
    db.select({ categories: links.categories }).from(links).where(activeWhere),
    engagedIds.length > 0
      ? db
          .select({ id: links.id, embedding: links.embedding })
          .from(links)
          .where(and(activeWhere, inArray(links.id, engagedIds)))
      : Promise.resolve([]),
  ]);

  const excludeIdSet = new Set(excludeIds);
  const candidateLinks = excludeIdSet.size > 0
    ? filteredLinks.filter((link) => !excludeIdSet.has(link.id))
    : filteredLinks;

  // Build engaged embeddings from the links the user engaged with this session
  const engagedEmbeddings: number[][] = [];
  for (const link of engagedRows) {
    if (Array.isArray(link.embedding)) {
      engagedEmbeddings.push(link.embedding as number[]);
    }
  }

  // Fetch time-of-day preferences (Level 4)
  const now = new Date();
  const hourSlot = now.getHours();
  const dayType = now.getDay() === 0 || now.getDay() === 6 ? "weekend" : "weekday";

  let timePrefs: TimePreference[] = [];
  try {
    const prefs = await db
      .select()
      .from(timePreferences)
      .where(
        and(
          eq(timePreferences.hourSlot, hourSlot),
          eq(timePreferences.dayType, dayType),
          eq(timePreferences.userId, userId)
        )
      );

    timePrefs = prefs.map((p) => ({
      category: p.category,
      avgEngagement: p.avgEngagement,
      sampleCount: p.sampleCount,
    }));
  } catch {
    // Time preferences table might not exist yet
  }

  // Build session context (Level 3)
  const session: SessionContext = {
    engagedLinkIds: engagedIds,
    engagedCategories: engagedCats,
    skippedCategories: skippedCats,
    engagedEmbeddings,
    cardsShown,
  };

  // Map to FeedLink type (decode HTML entities as safety net)
  const feedLinks: FeedLink[] = candidateLinks.map((link) => ({
    ...link,
    title: decodeEntities(link.title),
    description: decodeEntities(link.description),
    aiSummary: decodeEntities(link.aiSummary),
    siteName: decodeEntities(link.siteName),
    addedAt: link.addedAt.toISOString(),
    archivedAt: link.archivedAt?.toISOString() || null,
    lastShownAt: link.lastShownAt?.toISOString() || null,
    categories: link.categories || [],
    metadata: (link.metadata as Record<string, unknown>) || null,
    status: link.status as "active" | "archived",
    contentType: link.contentType as FeedLink["contentType"],
    embedding: (link.embedding as number[]) || null,
    engagementScore: link.engagementScore,
    avgDwellMs: link.avgDwellMs,
    openCount: link.openCount,
    likedAt: link.likedAt?.toISOString() || null,
  }));

  // Score with full 4-level algorithm
  const scored = scoreFeedLinks(feedLinks, session, timePrefs);

  // Strip embeddings from response (they're large and the client doesn't need them)
  const responseLinks = scored.slice(offset, offset + limit).map((link) => ({
    ...link,
    embedding: null,
  }));

  // Get unique categories for the tab bar
  const categorySet = new Set<string>();
  categoryRows.forEach((link) => {
    if (link.categories) {
      link.categories.forEach((c) => categorySet.add(c));
    }
  });

  return NextResponse.json({
    links: responseLinks,
    categories: Array.from(categorySet).sort(),
    total: categoryRows.length,
    filtered: candidateLinks.length,
  });
}
