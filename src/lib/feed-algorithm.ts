import { FeedLink } from "@/types";
import { cosineSimilarity } from "./ai";

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
  engagedLinkIds: string[];
  engagedCategories: string[];
  skippedCategories: string[];
  engagedEmbeddings: number[][];
  cardsShown: number;
}

interface SessionSignalMaps {
  engagedCategorySet: Set<string>;
  skippedCategorySet: Set<string>;
  engagedCategoryWeights: Map<string, number>;
  skippedCategoryWeights: Map<string, number>;
}

interface CategoryBanditStat {
  shown: number;
  engagementSum: number;
  linkCount: number;
}

interface DatasetStats {
  totalShown: number;
  globalEngagementMean: number;
  contentTypeMeans: Map<FeedLink["contentType"], number>;
  categoryBandits: Map<string, CategoryBanditStat>;
}

interface ScoringWeights {
  engagement: number;
  semantic: number;
  session: number;
  timePref: number;
  freshness: number;
  exploration: number;
}

const BASE_WEIGHTS: ScoringWeights = {
  engagement: 0.30,
  semantic: 0.25,
  session: 0.20,
  timePref: 0.10,
  freshness: 0.10,
  exploration: 0.05,
};

const SESSION_SIGNAL_RECENCY_DECAY = 0.92;
const UCB_EXPLORATION_COEFFICIENT = 0.28;

function engagementPredictScore(link: FeedLink, stats: DatasetStats): number {
  const shown = Math.max(0, link.shownCount);
  const typeMean =
    stats.contentTypeMeans.get(link.contentType) ?? stats.globalEngagementMean;
  const likedBoost = link.likedAt ? 0.08 : 0;

  if (shown === 0) {
    const coldStart = 0.58 + (typeMean - 0.5) * 0.2;
    return clamp01(coldStart + likedBoost);
  }

  const recencySignal = link.lastShownAt
    ? Math.exp(-daysSince(link.lastShownAt) / 30)
    : 0.55;
  const openRate = Math.min(1, link.openCount / Math.max(1, shown));
  const openSignal = openRate * 0.2;
  const baseline =
    link.engagementScore > 0
      ? link.engagementScore * 0.72 + typeMean * 0.28
      : typeMean * 0.9;
  const overShownPenalty = Math.min(0.22, Math.max(0, shown - 10) * 0.015);

  return clamp01(
    baseline * 0.67 +
      recencySignal * 0.23 +
      openSignal +
      likedBoost -
      overShownPenalty
  );
}

function semanticMatchScore(
  link: FeedLink,
  engagedEmbeddings: number[][]
): number {
  const linkEmbedding = link.embedding;
  if (!linkEmbedding || engagedEmbeddings.length === 0) return 0.5;

  let maxSim = 0;
  let avgSim = 0;

  for (const engaged of engagedEmbeddings) {
    const sim = clamp01((cosineSimilarity(linkEmbedding, engaged) + 1) / 2);
    maxSim = Math.max(maxSim, sim);
    avgSim += sim;
  }

  avgSim /= engagedEmbeddings.length;
  return clamp01(maxSim * 0.65 + avgSim * 0.35);
}

function sessionContextScore(
  link: FeedLink,
  session: SessionContext,
  signalMaps: SessionSignalMaps
): number {
  if (session.cardsShown === 0) return 0.5;

  const linkCats = link.categories || [];
  if (linkCats.length === 0) return 0.5;

  let momentum = 0;
  let skip = 0;
  let fatigue = 0;

  for (const category of linkCats) {
    const engagedWeight = signalMaps.engagedCategoryWeights.get(category) || 0;
    const skippedWeight = signalMaps.skippedCategoryWeights.get(category) || 0;

    momentum += engagedWeight;
    skip += skippedWeight;
    fatigue += Math.max(0, engagedWeight - 2);
  }

  const sameLaneBoost = linkCats.some((cat) =>
    signalMaps.engagedCategorySet.has(cat)
  )
    ? 0.04
    : 0;
  const score =
    0.5 +
    Math.min(0.32, momentum * 0.07) -
    Math.min(0.34, skip * 0.1) -
    Math.min(0.2, fatigue * 0.04) +
    sameLaneBoost;

  return clamp01(score);
}

function timePreferenceScore(
  link: FeedLink,
  preferenceScores: Map<string, number>
): number {
  if (preferenceScores.size === 0) return 0.5;

  const linkCats = link.categories || [];
  if (linkCats.length === 0) return 0.5;

  let bestScore = 0;
  for (const cat of linkCats) {
    const score = preferenceScores.get(cat);
    if (score !== undefined) bestScore = Math.max(bestScore, score);
  }

  return bestScore === 0 ? 0.5 : clamp01(bestScore);
}

function freshnessScore(link: FeedLink): number {
  const days = daysSince(link.addedAt);

  let ageScore: number;
  if (days < 1) ageScore = 0.72;
  else if (days < 14) ageScore = 0.56;
  else if (days <= 56) ageScore = 0.88;
  else if (days <= 120) ageScore = 0.42;
  else ageScore = 0.25;

  const showPenalty = Math.min(0.35, Math.max(0, link.shownCount) * 0.028);
  const likedBoost = link.likedAt ? 0.08 : 0;
  return clamp01(ageScore - showPenalty + likedBoost);
}

function explorationScore(
  link: FeedLink,
  stats: DatasetStats,
  signalMaps: SessionSignalMaps
): number {
  const shown = Math.max(0, link.shownCount);
  const linkCats = link.categories || [];
  const categoryPrior = getCategoryPrior(linkCats, stats);
  const meanEstimate =
    shown > 0 ? clamp01(link.engagementScore) : clamp01(categoryPrior);
  const uncertainty = Math.sqrt(Math.log(stats.totalShown + 2) / (shown + 1));

  let categoryNovelty = 0;
  for (const category of linkCats) {
    const categoryShown = stats.categoryBandits.get(category)?.shown || 0;
    categoryNovelty = Math.max(
      categoryNovelty,
      1 / Math.sqrt(categoryShown + 1)
    );
  }

  const unseenInSession =
    linkCats.length > 0 &&
    linkCats.every(
      (cat) =>
        !signalMaps.engagedCategorySet.has(cat) &&
        !signalMaps.skippedCategorySet.has(cat)
    );
  const sessionNovelty = unseenInSession ? 0.08 : 0;

  return clamp01(
    meanEstimate +
      UCB_EXPLORATION_COEFFICIENT * uncertainty +
      0.14 * categoryNovelty +
      sessionNovelty
  );
}

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
  if (links.length === 0) return [];

  const stats = buildDatasetStats(links);
  const signalMaps = buildSessionSignalMaps(session);
  const preferenceScores = buildTimePreferenceMap(timePrefs);
  const weights = deriveWeights({
    hasSemantic: session.engagedEmbeddings.length > 0,
    hasTimePrefs: preferenceScores.size > 0,
    cardsShown: session.cardsShown,
  });

  const scored: ScoredLink[] = links.map((link) => {
    const engagement = engagementPredictScore(link, stats);
    const semantic = semanticMatchScore(link, session.engagedEmbeddings);
    const sessionCtx = sessionContextScore(link, session, signalMaps);
    const timePref = timePreferenceScore(link, preferenceScores);
    const freshness = freshnessScore(link);
    const exploration = explorationScore(link, stats, signalMaps);

    const score =
      engagement * weights.engagement +
      semantic * weights.semantic +
      sessionCtx * weights.session +
      timePref * weights.timePref +
      freshness * weights.freshness +
      exploration * weights.exploration;

    return {
      link,
      score,
      breakdown: {
        engagement,
        semantic,
        session: sessionCtx,
        timePref,
        freshness,
        exploration,
      },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return applyDiversityPass(scored);
}

function applyDiversityPass(scored: ScoredLink[]): FeedLink[] {
  const result: FeedLink[] = [];
  const remaining = [...scored];
  const recentPrimaryCats: string[] = [];

  while (remaining.length > 0) {
    let picked = -1;

    for (let i = 0; i < remaining.length; i++) {
      const primaryCat = getPrimaryCategory(remaining[i].link);
      const isTripleRun =
        !!primaryCat &&
        recentPrimaryCats.length >= 2 &&
        recentPrimaryCats[recentPrimaryCats.length - 1] === primaryCat &&
        recentPrimaryCats[recentPrimaryCats.length - 2] === primaryCat;

      if (!isTripleRun || i > 7) {
        picked = i;
        break;
      }
    }

    if (picked === -1) picked = 0;

    const item = remaining.splice(picked, 1)[0];
    result.push(item.link);

    const primaryCat = getPrimaryCategory(item.link);
    if (primaryCat) recentPrimaryCats.push(primaryCat);
  }

  return result;
}

function buildDatasetStats(links: FeedLink[]): DatasetStats {
  let totalShown = 0;
  let globalEngagementSum = 0;

  const contentTypeTotals = new Map<
    FeedLink["contentType"],
    { weightedSum: number; shown: number }
  >();
  const categoryBandits = new Map<string, CategoryBanditStat>();

  for (const link of links) {
    const shown = Math.max(0, link.shownCount);
    const weightedEngagement = clamp01(link.engagementScore) * shown;

    if (shown > 0) {
      totalShown += shown;
      globalEngagementSum += weightedEngagement;

      const typeAgg = contentTypeTotals.get(link.contentType) || {
        weightedSum: 0,
        shown: 0,
      };
      typeAgg.weightedSum += weightedEngagement;
      typeAgg.shown += shown;
      contentTypeTotals.set(link.contentType, typeAgg);
    }

    const categories = link.categories || [];
    for (const category of categories) {
      const current = categoryBandits.get(category) || {
        shown: 0,
        engagementSum: 0,
        linkCount: 0,
      };
      current.shown += shown;
      current.engagementSum += weightedEngagement;
      current.linkCount += 1;
      categoryBandits.set(category, current);
    }
  }

  const globalEngagementMean =
    totalShown > 0 ? globalEngagementSum / totalShown : 0.5;
  const contentTypeMeans = new Map<FeedLink["contentType"], number>();

  for (const [type, agg] of contentTypeTotals) {
    contentTypeMeans.set(
      type,
      agg.shown > 0 ? agg.weightedSum / agg.shown : globalEngagementMean
    );
  }

  return {
    totalShown,
    globalEngagementMean,
    contentTypeMeans,
    categoryBandits,
  };
}

function buildSessionSignalMaps(session: SessionContext): SessionSignalMaps {
  return {
    engagedCategorySet: new Set(session.engagedCategories),
    skippedCategorySet: new Set(session.skippedCategories),
    engagedCategoryWeights: buildWeightedCategoryMap(session.engagedCategories),
    skippedCategoryWeights: buildWeightedCategoryMap(session.skippedCategories),
  };
}

function buildWeightedCategoryMap(categories: string[]): Map<string, number> {
  const weighted = new Map<string, number>();

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    const distanceFromTail = categories.length - 1 - i;
    const weight = Math.pow(SESSION_SIGNAL_RECENCY_DECAY, distanceFromTail);
    weighted.set(category, (weighted.get(category) || 0) + weight);
  }

  return weighted;
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

function deriveWeights(options: {
  hasSemantic: boolean;
  hasTimePrefs: boolean;
  cardsShown: number;
}): ScoringWeights {
  const weights: ScoringWeights = { ...BASE_WEIGHTS };

  if (!options.hasSemantic) {
    weights.engagement += 0.11;
    weights.session += 0.08;
    weights.exploration += 0.06;
    weights.semantic = 0;
  }

  if (!options.hasTimePrefs) {
    weights.engagement += 0.05;
    weights.freshness += 0.05;
    weights.timePref = 0;
  }

  if (options.cardsShown === 0) {
    weights.freshness += weights.session * 0.6;
    weights.exploration += weights.session * 0.4;
    weights.session = 0;
  } else if (options.cardsShown > 24) {
    const shift = weights.exploration * 0.5;
    weights.exploration -= shift;
    weights.engagement += shift * 0.6;
    weights.session += shift * 0.4;
  }

  return normalizeWeights(weights);
}

function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const sum =
    weights.engagement +
    weights.semantic +
    weights.session +
    weights.timePref +
    weights.freshness +
    weights.exploration;

  if (sum <= 0) return { ...BASE_WEIGHTS };

  return {
    engagement: weights.engagement / sum,
    semantic: weights.semantic / sum,
    session: weights.session / sum,
    timePref: weights.timePref / sum,
    freshness: weights.freshness / sum,
    exploration: weights.exploration / sum,
  };
}

function getCategoryPrior(categories: string[], stats: DatasetStats): number {
  if (categories.length === 0) return stats.globalEngagementMean;

  let best = stats.globalEngagementMean;
  for (const category of categories) {
    const stat = stats.categoryBandits.get(category);
    if (!stat || stat.shown <= 0) continue;
    best = Math.max(best, stat.engagementSum / stat.shown);
  }

  return clamp01(best);
}

function getPrimaryCategory(link: FeedLink): string | null {
  const categories = link.categories || [];
  if (categories.length > 0) return categories[0];
  return null;
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
