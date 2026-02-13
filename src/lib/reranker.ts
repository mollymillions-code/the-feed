import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RankingCandidate } from "./feed-algorithm";

interface XGBoostTreeNode {
  left: number;
  right: number;
  feature: number;
  threshold: number;
  defaultLeft?: boolean;
  leaf?: number;
}

interface XGBoostTree {
  nodes: XGBoostTreeNode[];
}

interface XGBoostRerankerModel {
  version: string;
  modelType: "xgboost_tree";
  objective: "binary:logistic" | "reg:squarederror" | "rank:pairwise";
  featureOrder: string[];
  baseScore: number;
  trees: XGBoostTree[];
  metadata?: Record<string, unknown>;
}

export interface RerankerApplyResult {
  candidates: RankingCandidate[];
  rerankerVersion: string | null;
  applied: boolean;
}

let cachedModelPath = "";
let cachedModel: XGBoostRerankerModel | null = null;
let loadAttempted = false;

function isRerankerEnabled(): boolean {
  return process.env.ENABLE_XGBOOST_RERANKER === "true";
}

function getModelPath(): string {
  return resolve(
    process.env.XGBOOST_RERANKER_MODEL_PATH || "models/xgboost-reranker.json"
  );
}

async function loadRerankerModel(): Promise<XGBoostRerankerModel | null> {
  if (!isRerankerEnabled()) return null;

  const modelPath = getModelPath();
  if (loadAttempted && cachedModelPath === modelPath) {
    return cachedModel;
  }

  loadAttempted = true;
  cachedModelPath = modelPath;

  try {
    const raw = await readFile(modelPath, "utf8");
    const parsed = JSON.parse(raw) as XGBoostRerankerModel;
    if (
      parsed.modelType !== "xgboost_tree" ||
      !Array.isArray(parsed.featureOrder) ||
      !Array.isArray(parsed.trees)
    ) {
      cachedModel = null;
      return null;
    }

    cachedModel = parsed;
    return parsed;
  } catch {
    cachedModel = null;
    return null;
  }
}

export async function maybeApplyXGBoostReranker(
  candidates: RankingCandidate[]
): Promise<RerankerApplyResult> {
  const model = await loadRerankerModel();
  if (!model || candidates.length === 0) {
    return {
      candidates,
      rerankerVersion: null,
      applied: false,
    };
  }

  const rawScores = candidates.map((candidate) =>
    predictWithModel(candidate.features, model)
  );
  const normalizedScores = normalizeScores(rawScores);

  const reranked = candidates.map((candidate, index) => {
    const modelScore = normalizedScores[index] ?? 0.5;
    const blended = candidate.baseScore * 0.35 + modelScore * 0.65;

    return {
      ...candidate,
      rerankScore: modelScore,
      score: blended,
    };
  });

  reranked.sort((a, b) => b.score - a.score);

  return {
    candidates: reranked,
    rerankerVersion: model.version,
    applied: true,
  };
}

function predictWithModel(
  features: Record<string, number>,
  model: XGBoostRerankerModel
): number {
  const vector = model.featureOrder.map((name) => features[name] ?? 0);
  let margin = model.baseScore;

  for (const tree of model.trees) {
    margin += evaluateTree(tree, vector);
  }

  if (model.objective === "binary:logistic") {
    return sigmoid(margin);
  }

  return margin;
}

function evaluateTree(tree: XGBoostTree, featureVector: number[]): number {
  if (!tree.nodes.length) return 0;

  let nodeIndex = 0;
  let guard = 0;

  while (guard < 2048) {
    guard++;
    const node = tree.nodes[nodeIndex];
    if (!node) return 0;

    if (typeof node.leaf === "number") {
      return node.leaf;
    }

    const featureValue = featureVector[node.feature] ?? 0;
    const goLeft =
      Number.isNaN(featureValue) || featureValue < node.threshold
        ? true
        : false;

    if (Number.isNaN(featureValue)) {
      nodeIndex = node.defaultLeft ? node.left : node.right;
    } else {
      nodeIndex = goLeft ? node.left : node.right;
    }

    if (nodeIndex < 0) return 0;
  }

  return 0;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return scores;

  const finiteScores = scores.map((score) =>
    Number.isFinite(score) ? score : 0
  );
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const score of finiteScores) {
    min = Math.min(min, score);
    max = Math.max(max, score);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-9) {
    return finiteScores.map(() => 0.5);
  }

  const denom = max - min;
  return finiteScores.map((score) => (score - min) / denom);
}
