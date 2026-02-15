import { FeedLink } from "@/types";
import { decodeEntities } from "@/lib/utils";
import { links } from "./schema";

type DbLink = typeof links.$inferSelect;

/**
 * Map a raw Drizzle link row to the client-safe FeedLink shape.
 * Strips embeddings by default (large vectors shouldn't go to the client).
 */
export function dbLinkToFeedLink(link: DbLink): FeedLink {
  return {
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
    embedding: null,
    engagementScore: link.engagementScore,
    avgDwellMs: link.avgDwellMs,
    openCount: link.openCount,
    likedAt: link.likedAt?.toISOString() || null,
  };
}
