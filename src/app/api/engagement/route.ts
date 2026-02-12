import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, links, timePreferences } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getSession } from "@/lib/auth";

/**
 * POST /api/engagement — Log a behavioral event
 *
 * This is the raw signal pipeline. Every swipe, every tap, every second
 * of dwell time becomes a training signal for the recommendation engine.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session.userId!;
  const body = await request.json();
  const {
    linkId,
    eventType,
    dwellTimeMs,
    swipeVelocity,
    cardIndex,
    sessionId,
  } = body;

  if (!linkId || !eventType) {
    return NextResponse.json({ error: "linkId and eventType required" }, { status: 400 });
  }

  const now = new Date();
  const hourOfDay = now.getHours();
  const dayOfWeek = now.getDay();

  // 1. Log the raw engagement event
  await db.insert(engagements).values({
    id: nanoid(12),
    userId,
    linkId,
    eventType,
    dwellTimeMs: dwellTimeMs || null,
    swipeVelocity: swipeVelocity || null,
    cardIndex: cardIndex ?? null,
    hourOfDay,
    dayOfWeek,
    sessionId: sessionId || null,
  });

  // 2. Update link-level aggregated scores
  if (eventType === "dwell" && dwellTimeMs) {
    const [link] = await db
      .select()
      .from(links)
      .where(and(eq(links.id, linkId), eq(links.userId, userId)))
      .limit(1);

    if (link) {
      // Compute engagement score from this interaction
      const interactionScore = computeEngagementScore(
        dwellTimeMs,
        swipeVelocity,
        eventType
      );

      // Running average of engagement score
      const totalInteractions = link.shownCount || 1;
      const newEngagement =
        (link.engagementScore * (totalInteractions - 1) + interactionScore) /
        totalInteractions;

      // Running average of dwell time
      const newAvgDwell = Math.round(
        (link.avgDwellMs * (totalInteractions - 1) + dwellTimeMs) /
        totalInteractions
      );

      await db
        .update(links)
        .set({
          engagementScore: newEngagement,
          avgDwellMs: newAvgDwell,
        })
        .where(and(eq(links.id, linkId), eq(links.userId, userId)));

      // 3. Update time-of-day preferences (Level 4)
      if (link.categories && link.categories.length > 0) {
        const dayType = dayOfWeek === 0 || dayOfWeek === 6 ? "weekend" : "weekday";

        for (const category of link.categories) {
          await updateTimePreference(
            userId,
            hourOfDay,
            dayType,
            category,
            interactionScore
          );
        }
      }
    }
  }

  // Track opens separately
  if (eventType === "open") {
    const [link] = await db
      .select()
      .from(links)
      .where(and(eq(links.id, linkId), eq(links.userId, userId)))
      .limit(1);

    if (link) {
      await db
        .update(links)
        .set({ openCount: link.openCount + 1 })
        .where(and(eq(links.id, linkId), eq(links.userId, userId)));
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Compute an engagement score from behavioral signals.
 *
 * Score range: 0.0 (zero interest) to 1.0 (deep engagement)
 *
 * The logic:
 * - Dwell time is the strongest signal. More time = more interest.
 *   But it's logarithmic — the difference between 1s and 5s is huge,
 *   the difference between 30s and 35s is small.
 * - Swipe velocity is a negative signal. Fast swipe = "not interested".
 *   Slow deliberate swipe = "I'm done but it was good".
 * - Opens are a strong positive signal (handled separately).
 */
function computeEngagementScore(
  dwellTimeMs: number,
  swipeVelocity: number | null,
  eventType: string
): number {
  let score = 0;

  // Dwell time component (0 to 0.7)
  // Log scale: 1s=0.1, 3s=0.25, 10s=0.4, 30s=0.55, 60s=0.65, 120s=0.7
  const dwellSeconds = dwellTimeMs / 1000;
  const dwellScore = Math.min(0.7, Math.log(1 + dwellSeconds) / Math.log(1 + 120) * 0.7);
  score += dwellScore;

  // Swipe velocity penalty (0 to -0.2)
  // Fast swipe (>2 px/ms) = strong negative signal
  // Slow swipe (<0.5 px/ms) = neutral/positive
  if (swipeVelocity !== null) {
    const velocityPenalty = Math.min(0.2, Math.max(0, (swipeVelocity - 0.5) * 0.1));
    score -= velocityPenalty;
  }

  // Open bonus
  if (eventType === "open") {
    score += 0.3;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Update time-of-day preferences using an incremental running average.
 *
 * This learns patterns like: "User engages heavily with AI content at 10am on weekdays"
 */
async function updateTimePreference(
  userId: string,
  hour: number,
  dayType: string,
  category: string,
  engagementScore: number
) {
  const existing = await db
    .select()
    .from(timePreferences)
    .where(
      and(
        eq(timePreferences.hourSlot, hour),
        eq(timePreferences.dayType, dayType),
        eq(timePreferences.category, category),
        eq(timePreferences.userId, userId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const pref = existing[0];
    const newCount = pref.sampleCount + 1;
    const newAvg =
      (pref.avgEngagement * pref.sampleCount + engagementScore) / newCount;

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
      avgEngagement: engagementScore,
      sampleCount: 1,
    });
  }
}
