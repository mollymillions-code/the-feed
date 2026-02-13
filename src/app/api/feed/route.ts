import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { links, rankingEvents, timePreferences } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  scoreFeedCandidates,
  applyDiversityPass,
  FEED_ALGORITHM_VERSION,
  SessionContext,
  TimePreference,
} from "@/lib/feed-algorithm";
import { FeedLink } from "@/types";
import { decodeEntities } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { nanoid } from "nanoid";
import { maybeApplyXGBoostReranker } from "@/lib/reranker";

const RANKING_LOG_CANDIDATE_LIMIT = 60;
const MAX_SEMANTIC_SIGNAL_LINKS = 48;

// GET /api/feed — get smart-ordered feed with full recommendation engine
export async function GET(request: NextRequest) {
  const authSession = await getSession();
  const userId = authSession.userId!;
  const category = request.nextUrl.searchParams.get("category") || "All";
  const includeCategories = request.nextUrl.searchParams.get("includeCategories") !== "0";
  const parsedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "20", 10);
  const parsedOffset = Number.parseInt(request.nextUrl.searchParams.get("offset") || "0", 10);
  const limit = Number.isNaN(parsedLimit) ? 20 : Math.max(1, Math.min(parsedLimit, 50));
  const offset = Number.isNaN(parsedOffset) ? 0 : Math.max(0, parsedOffset);
  const sessionId = request.nextUrl.searchParams.get("sessionId") || null;
  const excludeIds = request.nextUrl.searchParams.get("excludeIds")?.split(",").filter(Boolean) || [];

  // Session context from query params (sent by the client)
  const engagedIds = request.nextUrl.searchParams.get("engagedIds")?.split(",").filter(Boolean) || [];
  const engagedCats = request.nextUrl.searchParams.get("engagedCats")?.split(",").filter(Boolean) || [];
  const skippedCats = request.nextUrl.searchParams.get("skippedCats")?.split(",").filter(Boolean) || [];
  const cardsShown = Number.parseInt(request.nextUrl.searchParams.get("cardsShown") || "0", 10) || 0;
  const semanticEngagedIds = engagedIds.slice(-MAX_SEMANTIC_SIGNAL_LINKS);

  const activeWhere = and(eq(links.status, "active"), eq(links.userId, userId));
  const filteredWhere = category === "All"
    ? activeWhere
    : and(activeWhere, sql`${category} = ANY(${links.categories})`);

  const [filteredLinks, categoryRows, engagedRows] = await Promise.all([
    db.select().from(links).where(filteredWhere),
    includeCategories
      ? db.select({ categories: links.categories }).from(links).where(activeWhere)
      : Promise.resolve([]),
    semanticEngagedIds.length > 0
      ? db
          .select({ id: links.id, embedding: links.embedding })
          .from(links)
          .where(and(activeWhere, inArray(links.id, semanticEngagedIds)))
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

  // Score with phase II algorithm and optional reranker.
  const heuristicCandidates = scoreFeedCandidates(feedLinks, session, timePrefs, {
    applyDiversity: false,
  });
  const rerankResult = await maybeApplyXGBoostReranker(heuristicCandidates);
  const finalCandidates = applyDiversityPass(rerankResult.candidates);

  const selectedCandidates = finalCandidates.slice(offset, offset + limit);
  const responseLinks = selectedCandidates.map((candidate) => ({
    ...candidate.link,
    embedding: null,
  }));
  const feedRequestId = nanoid(12);

  const servedRankByLinkId = new Map(
    selectedCandidates.map((candidate, index) => [candidate.link.id, index + 1] as const)
  );

  const logCandidates = finalCandidates.slice(
    0,
    Math.min(finalCandidates.length, Math.max(limit * 3, RANKING_LOG_CANDIDATE_LIMIT))
  );

  if (logCandidates.length > 0) {
    try {
      await db
        .insert(rankingEvents)
        .values(
          logCandidates.map((candidate, index) => ({
            id: nanoid(16),
            userId,
            sessionId,
            feedRequestId,
            linkId: candidate.link.id,
            algorithmVersion: FEED_ALGORITHM_VERSION,
            rerankerVersion: rerankResult.rerankerVersion,
            activeCategory: category,
            cardsShown,
            candidateRank: index + 1,
            servedRank: servedRankByLinkId.get(candidate.link.id) ?? null,
            baseScore: candidate.baseScore,
            rerankScore: candidate.rerankScore,
            finalScore: candidate.score,
            features: candidate.features,
          }))
        )
        .onConflictDoNothing();
    } catch {
      // logging should never block feed rendering
    }
  }

  // Get unique categories for the tab bar only when requested.
  const categories = includeCategories
    ? buildCategoryList(categoryRows)
    : [];

  return NextResponse.json({
    links: responseLinks,
    categories,
    total: includeCategories ? categoryRows.length : filteredLinks.length,
    filtered: candidateLinks.length,
    feedRequestId,
    algorithmVersion: FEED_ALGORITHM_VERSION,
    rerankerApplied: rerankResult.applied,
    rerankerVersion: rerankResult.rerankerVersion,
  });
}

function buildCategoryList(rows: Array<{ categories: string[] | null }>): string[] {
  const categorySet = new Set<string>();
  for (const row of rows) {
    if (!row.categories) continue;
    for (const category of row.categories) {
      categorySet.add(category);
    }
  }
  return Array.from(categorySet).sort();
}
