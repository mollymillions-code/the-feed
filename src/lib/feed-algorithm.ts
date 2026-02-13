import { FeedLink } from "@/types";
import { cosineSimilarity } from "./ai";

/**
 * THE FEED — Recommendation Algorithm v2
 *
 * A 4-level scoring system that learns from your behavior to surface
 * the right content at the right time.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                                                                 │
 * │  Final Score = engagement_predict × 0.30   ← Level 1           │
 * │              + semantic_match    × 0.25   ← Level 2           │
 * │              + session_context   × 0.20   ← Level 3           │
 * │              + time_preference   × 0.10   ← Level 4           │
 * │              + freshness_decay   × 0.10   ← Base              │
 * │              + exploration       × 0.05   ← Explore vs Exploit│
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Each level can operate independently. If there's no data for a level
 * (e.g., no embeddings yet, no time preferences learned), it falls back
 * to a neutral 0.5 score — it doesn't break, it just contributes less.
 */

// ─────────────── Types ───────────────

interface ScoredLink {
  link: FeedLink;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  engagement: number;
  semantic: number;
  session: number;
  timePref: number;
  freshness: number;
  exploration: number;
}

export interface TimePreference {
  category: string;
  avgEngagement: number;
  sampleCount: number;
}

export interface SessionContext {
  /** Link IDs the user engaged with (dwelled >3s or opened) this session */
  engagedLinkIds: string[];
  /** Categories the user engaged with this session */
  engagedCategories: string[];
  /** Categories the user swiped past quickly this session */
  skippedCategories: string[];
  /** Embeddings of content the user engaged with this session */
  engagedEmbeddings: number[][];
  /** How many cards shown so far this session */
  cardsShown: number;
}

interface SessionSignalMaps {
  engagedCategorySet: Set<string>;
  engagedCategoryCounts: Map<string, number>;
  skippedCategorySet: Set<string>;
}

// ─────────────── Level 1: Engagement Prediction ───────────────

/**
 * Predicts how likely you are to engage with this content based on
 * your past behavior with THIS specific link and similar links.
 *
 * Signals:
 * - Historical engagement score (learned from dwell time + swipe velocity)
 * - Open count (did you actually tap into the content?)
 * - Never-seen bonus (unseen = high potential)
 * - Show-count decay (shown 10 times but low engagement = stop showing)
 */
function engagementPredictScore(link: FeedLink): number {
  // Never-seen items get a strong exploration bonus
  if (link.shownCount === 0) return 0.8;

  // Use learned engagement score if available
  if (link.engagementScore > 0) {
    const recencyDecay = link.lastShownAt
      ? Math.exp(-daysSince(link.lastShownAt) / 30)
      : 0.5;

    return link.engagementScore * 0.7 + recencyDecay * 0.3;
  }

  // Shown but no engagement data — decay with each re-show
  return Math.max(0.2, 0.6 - link.shownCount * 0.05);
}

// ─────────────── Level 2: Semantic Similarity ───────────────

/**
 * How semantically similar is this link to content you've recently
 * engaged with?
 *
 * A 3Blue1Brown video about neural networks and an Andrej Karpathy
 * blog post about backpropagation will have similar embeddings —
 * even though they're different formats on different platforms.
 */
function semanticMatchScore(
  link: FeedLink,
  engagedEmbeddings: number[][]
): number {
  const linkEmbedding = link.embedding;

  if (!linkEmbedding || engagedEmbeddings.length === 0) return 0.5;

  let maxSim = 0;
  let avgSim = 0;

  for (const engaged of engagedEmbeddings) {
    const sim = cosineSimilarity(linkEmbedding, engaged);
    maxSim = Math.max(maxSim, sim);
    avgSim += sim;
  }

  avgSim /= engagedEmbeddings.length;

  // Blend max (strong single-item match) and avg (broad interest match)
  const blended = maxSim * 0.6 + avgSim * 0.4;

  return Math.max(0, Math.min(1, blended));
}

// ─────────────── Level 3: Session Context ───────────────

/**
 * Real-time adaptation based on what's happening in THIS session.
 *
 * Three sub-signals:
 * 1. Category momentum: engaging with AI → boost more AI (you're in the zone)
 * 2. Category fatigue: 4+ of same → penalize (need variety)
 * 3. Skip signal: fast-swiped past 2+ → strong penalty (not in the mood)
 */
function sessionContextScore(
  link: FeedLink,
  session: SessionContext,
  signalMaps: SessionSignalMaps
): number {
  if (session.cardsShown === 0) return 0.5;

  const linkCats = link.categories || [];
  if (linkCats.length === 0) return 0.5;

  let score = 0.5;

  // Momentum: engaged categories get a boost
  const engagedOverlap = linkCats.reduce(
    (count, category) => count + (signalMaps.engagedCategorySet.has(category) ? 1 : 0),
    0
  );
  if (engagedOverlap > 0) {
    score += Math.min(0.3, engagedOverlap * 0.15);
  }

  // Fatigue: too many of same category
  const catCount = linkCats.reduce(
    (total, category) => total + (signalMaps.engagedCategoryCounts.get(category) || 0),
    0
  );
  if (catCount > 3) {
    score -= Math.min(0.3, (catCount - 3) * 0.1);
  }

  // Skip signal: strong negative
  const skipOverlap = linkCats.reduce(
    (count, category) => count + (signalMaps.skippedCategorySet.has(category) ? 1 : 0),
    0
  );
  if (skipOverlap > 0) {
    score -= Math.min(0.3, skipOverlap * 0.15);
  }

  return Math.max(0, Math.min(1, score));
}

// ─────────────── Level 4: Time-of-Day Preferences ───────────────

/**
 * Boosts content matching your learned time-of-day patterns.
 *
 * After enough data points, this learns:
 * - 8am weekdays: Tech, AI (deep work mode)
 * - 12pm weekdays: Fun, Creativity (lunch break)
 * - 9pm weekends: Wisdom, Design (relaxed browsing)
 */
function timePreferenceScore(
  link: FeedLink,
  preferenceScores: Map<string, number>
): number {
  if (preferenceScores.size === 0) return 0.5;

  const linkCats = link.categories || [];
  if (linkCats.length === 0) return 0.5;

  let bestScore = 0;

  for (const cat of linkCats) {
    const prefScore = preferenceScores.get(cat);
    if (prefScore !== undefined) {
      bestScore = Math.max(bestScore, prefScore);
    }
  }

  return bestScore === 0 ? 0.5 : bestScore;
}

// ─────────────── Base: Freshness & Decay ───────────────

/**
 * The "forgotten gems" curve:
 * - Just added: see it soon
 * - 2-8 weeks old: BOOST (you probably forgot about this)
 * - Old: lower priority but not zero
 */
function freshnessScore(link: FeedLink): number {
  const days = daysSince(link.addedAt);

  let ageScore: number;
  if (days < 1) ageScore = 0.7;
  else if (days < 14) ageScore = 0.5;
  else if (days <= 56) ageScore = 0.9;   // 2-8 weeks: forgotten gems
  else if (days <= 120) ageScore = 0.4;
  else ageScore = 0.25;

  // Penalize over-shown content
  const showPenalty = Math.min(0.3, link.shownCount * 0.03);

  return Math.max(0, ageScore - showPenalty);
}

// ─────────────── Exploration Factor ───────────────

/**
 * Explore-exploit tradeoff. Occasionally boosts low-scored items
 * to discover new interests and prevent filter bubbles.
 */
function explorationScore(): number {
  if (Math.random() < 0.1) return 0.9;  // 10% chance of strong explore
  return Math.random() * 0.3;
}

// ─────────────── Main Scoring Function ───────────────

export function scoreFeedLinks(
  links: FeedLink[],
  session: SessionContext = {
    engagedLinkIds: [],
    engagedCategories: [],
    skippedCategories: [],
    engagedEmbeddings: [],
    cardsShown: 0,
  },
  timePrefs: TimePreference[] = []
): FeedLink[] {
  const signalMaps = buildSessionSignalMaps(session);
  const preferenceScores = buildTimePreferenceMap(timePrefs);

  const scored: ScoredLink[] = links.map((link) => {
    const engagement = engagementPredictScore(link);
    const semantic = semanticMatchScore(link, session.engagedEmbeddings);
    const sessionCtx = sessionContextScore(link, session, signalMaps);
    const timePref = timePreferenceScore(link, preferenceScores);
    const freshness = freshnessScore(link);
    const exploration = explorationScore();

    const score =
      engagement * 0.30 +
      semantic * 0.25 +
      sessionCtx * 0.20 +
      timePref * 0.10 +
      freshness * 0.10 +
      exploration * 0.05;

    return {
      link,
      score,
      breakdown: { engagement, semantic, session: sessionCtx, timePref, freshness, exploration },
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return applyDiversityPass(scored);
}

/**
 * Post-sort diversity: prevent 3+ of the same category in a row.
 */
function applyDiversityPass(scored: ScoredLink[]): FeedLink[] {
  const result: FeedLink[] = [];
  const remaining = [...scored];
  const recentCats: string[] = [];

  while (remaining.length > 0) {
    let picked = -1;

    for (let i = 0; i < remaining.length; i++) {
      const cats = remaining[i].link.categories || [];
      const would3Run = cats.some(
        (c) =>
          recentCats.length >= 2 &&
          recentCats[recentCats.length - 1] === c &&
          recentCats[recentCats.length - 2] === c
      );

      if (!would3Run || i > 5) {
        picked = i;
        break;
      }
    }

    if (picked === -1) picked = 0;

    const item = remaining.splice(picked, 1)[0];
    result.push(item.link);

    const cats = item.link.categories || [];
    if (cats.length > 0) recentCats.push(cats[0]);
  }

  return result;
}

// ─────────────── Helpers ───────────────

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function buildSessionSignalMaps(session: SessionContext): SessionSignalMaps {
  const engagedCategoryCounts = new Map<string, number>();

  for (const category of session.engagedCategories) {
    engagedCategoryCounts.set(category, (engagedCategoryCounts.get(category) || 0) + 1);
  }

  return {
    engagedCategorySet: new Set(session.engagedCategories),
    engagedCategoryCounts,
    skippedCategorySet: new Set(session.skippedCategories),
  };
}

function buildTimePreferenceMap(timePrefs: TimePreference[]): Map<string, number> {
  const preferenceScores = new Map<string, number>();

  for (const pref of timePrefs) {
    if (pref.sampleCount < 3) continue;
    const current = preferenceScores.get(pref.category) || 0;
    if (pref.avgEngagement > current) {
      preferenceScores.set(pref.category, pref.avgEngagement);
    }
  }

  return preferenceScores;
}
