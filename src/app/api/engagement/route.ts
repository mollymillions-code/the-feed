import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, links, timePreferences } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getSession } from "@/lib/auth";

type EventType = "impression" | "dwell" | "open";

interface EngagementPayload {
  linkId: string;
  eventType: EventType;
  dwellTimeMs?: number;
  swipeVelocity?: number;
  cardIndex?: number;
  sessionId?: string;
  feedRequestId?: string;
}

interface TimePreferenceContribution {
  sum: number;
  count: number;
}

/**
 * POST /api/engagement — Log behavioral events (single or batched)
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session.userId!;
  const body = await request.json();

  const rawEvents: unknown[] = Array.isArray(body?.events)
    ? body.events
    : body
      ? [body]
      : [];

  const events = rawEvents.filter(isEngagementPayload);
  if (events.length === 0) {
    return NextResponse.json({ error: "No valid engagement events provided" }, { status: 400 });
  }

  const now = new Date();
  const hourOfDay = now.getHours();
  const dayOfWeek = now.getDay();
  const dayType = dayOfWeek === 0 || dayOfWeek === 6 ? "weekend" : "weekday";

  await db.insert(engagements).values(
    events.map((event) => ({
      id: nanoid(12),
      userId,
      linkId: event.linkId,
      eventType: event.eventType,
      dwellTimeMs: event.dwellTimeMs || null,
      swipeVelocity: event.swipeVelocity || null,
      cardIndex: event.cardIndex ?? null,
      hourOfDay,
      dayOfWeek,
      sessionId: event.sessionId || null,
      feedRequestId: event.feedRequestId || null,
    }))
  );

  const impressionCounts = aggregateCounts(events, "impression");
  for (const [linkId, count] of impressionCounts) {
    await db
      .update(links)
      .set({
        shownCount: sql`${links.shownCount} + ${count}`,
        lastShownAt: now,
      })
      .where(and(eq(links.id, linkId), eq(links.userId, userId)));
  }

  const openCounts = aggregateCounts(events, "open");
  for (const [linkId, count] of openCounts) {
    await db
      .update(links)
      .set({
        openCount: sql`${links.openCount} + ${count}`,
      })
      .where(and(eq(links.id, linkId), eq(links.userId, userId)));
  }

  const dwellEvents = events.filter(
    (event): event is EngagementPayload & { dwellTimeMs: number } =>
      event.eventType === "dwell" &&
      typeof event.dwellTimeMs === "number" &&
      event.dwellTimeMs > 0
  );

  if (dwellEvents.length > 0) {
    const dwellLinkIds = Array.from(new Set(dwellEvents.map((event) => event.linkId)));
    const dwellLinks = await db
      .select({ id: links.id, categories: links.categories })
      .from(links)
      .where(and(eq(links.userId, userId), inArray(links.id, dwellLinkIds)));

    const categoriesByLink = new Map(
      dwellLinks.map((link) => [link.id, link.categories || []] as const)
    );

    const preferenceContributions = new Map<string, TimePreferenceContribution>();

    for (const event of dwellEvents) {
      const interactionScore = computeEngagementScore(event.dwellTimeMs, event.swipeVelocity ?? null);

      await db
        .update(links)
        .set({
          engagementScore: sql`CASE
            WHEN ${links.shownCount} <= 1 THEN ${interactionScore}
            ELSE ((${links.engagementScore} * (${links.shownCount} - 1) + ${interactionScore}) / ${links.shownCount})
          END`,
          avgDwellMs: sql`ROUND(CASE
            WHEN ${links.shownCount} <= 1 THEN ${event.dwellTimeMs}
            ELSE ((${links.avgDwellMs} * (${links.shownCount} - 1) + ${event.dwellTimeMs}) / ${links.shownCount})
          END)::int`,
        })
        .where(and(eq(links.id, event.linkId), eq(links.userId, userId)));

      const categories = categoriesByLink.get(event.linkId) || [];
      for (const category of categories) {
        const current = preferenceContributions.get(category) || { sum: 0, count: 0 };
        current.sum += interactionScore;
        current.count += 1;
        preferenceContributions.set(category, current);
      }
    }

    await updateTimePreferences(userId, hourOfDay, dayType, preferenceContributions);
  }

  return NextResponse.json({ ok: true, processed: events.length });
}

function isEngagementPayload(value: unknown): value is EngagementPayload {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<EngagementPayload>;

  return (
    typeof event.linkId === "string" &&
    !!event.linkId &&
    (event.eventType === "impression" ||
      event.eventType === "dwell" ||
      event.eventType === "open")
  );
}

function aggregateCounts(events: EngagementPayload[], eventType: EventType): Map<string, number> {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (event.eventType !== eventType) continue;
    counts.set(event.linkId, (counts.get(event.linkId) || 0) + 1);
  }

  return counts;
}

/**
 * Compute an engagement score from behavioral signals.
 *
 * Score range: 0.0 (zero interest) to 1.0 (deep engagement)
 */
function computeEngagementScore(
  dwellTimeMs: number,
  swipeVelocity: number | null
): number {
  let score = 0;

  // Dwell time component (0 to 0.7) on log scale.
  const dwellSeconds = dwellTimeMs / 1000;
  const dwellScore = Math.min(0.7, Math.log(1 + dwellSeconds) / Math.log(1 + 120) * 0.7);
  score += dwellScore;

  // Swipe velocity penalty (0 to -0.2)
  if (swipeVelocity !== null) {
    const velocityPenalty = Math.min(0.2, Math.max(0, (swipeVelocity - 0.5) * 0.1));
    score -= velocityPenalty;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Update time-of-day preferences with batched contribution deltas.
 */
async function updateTimePreferences(
  userId: string,
  hour: number,
  dayType: string,
  contributions: Map<string, TimePreferenceContribution>
) {
  if (contributions.size === 0) return;

  const categories = Array.from(contributions.keys());
  const existing = await db
    .select()
    .from(timePreferences)
    .where(
      and(
        eq(timePreferences.hourSlot, hour),
        eq(timePreferences.dayType, dayType),
        eq(timePreferences.userId, userId),
        inArray(timePreferences.category, categories)
      )
    );

  const existingByCategory = new Map(existing.map((pref) => [pref.category, pref] as const));

  for (const [category, contribution] of contributions) {
    const pref = existingByCategory.get(category);

    if (pref) {
      const newCount = pref.sampleCount + contribution.count;
      const newAvg =
        (pref.avgEngagement * pref.sampleCount + contribution.sum) / newCount;

      await db
        .update(timePreferences)
        .set({
          avgEngagement: newAvg,
          sampleCount: newCount,
          updatedAt: new Date(),
        })
        .where(eq(timePreferences.id, pref.id));
    } else {
      await db.insert(timePreferences).values({
        id: nanoid(12),
        userId,
        hourSlot: hour,
        dayType,
        category,
        avgEngagement: contribution.sum / contribution.count,
        sampleCount: contribution.count,
      });
    }
  }
}
