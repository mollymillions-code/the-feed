import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { links, timePreferences } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { scoreFeedLinks, SessionContext, TimePreference } from "@/lib/feed-algorithm";
import { FeedLink } from "@/types";

// GET /api/feed — get smart-ordered feed with full recommendation engine
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") || "All";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");

  // Session context from query params (sent by the client)
  const engagedIds = request.nextUrl.searchParams.get("engagedIds")?.split(",").filter(Boolean) || [];
  const engagedCats = request.nextUrl.searchParams.get("engagedCats")?.split(",").filter(Boolean) || [];
  const skippedCats = request.nextUrl.searchParams.get("skippedCats")?.split(",").filter(Boolean) || [];
  const cardsShown = parseInt(request.nextUrl.searchParams.get("cardsShown") || "0");

  // Fetch active links
  const allLinks = await db
    .select()
    .from(links)
    .where(eq(links.status, "active"));

  // Filter by category if not "All"
  let filtered = allLinks;
  if (category !== "All") {
    filtered = allLinks.filter(
      (link) => link.categories && link.categories.includes(category)
    );
  }

  // Build engaged embeddings from the links the user engaged with this session
  const engagedEmbeddings: number[][] = [];
  if (engagedIds.length > 0) {
    for (const link of allLinks) {
      if (engagedIds.includes(link.id) && link.embedding) {
        engagedEmbeddings.push(link.embedding as number[]);
      }
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
          eq(timePreferences.dayType, dayType)
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

  // Map to FeedLink type
  const feedLinks: FeedLink[] = filtered.map((link) => ({
    ...link,
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
  }));

  // Score with full 4-level algorithm
  const scored = scoreFeedLinks(feedLinks, session, timePrefs);

  // Strip embeddings from response (they're large and the client doesn't need them)
  const responseLinks = scored.slice(0, limit).map((link) => ({
    ...link,
    embedding: null,
  }));

  // Get unique categories for the tab bar
  const categorySet = new Set<string>();
  allLinks.forEach((link) => {
    if (link.categories) {
      link.categories.forEach((c) => categorySet.add(c));
    }
  });

  return NextResponse.json({
    links: responseLinks,
    categories: Array.from(categorySet).sort(),
    total: allLinks.length,
    filtered: filtered.length,
  });
}
