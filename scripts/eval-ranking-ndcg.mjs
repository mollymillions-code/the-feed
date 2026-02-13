/**
 * Evaluate ranking quality using NDCG from exported training data.
 *
 * Usage:
 *   node scripts/eval-ranking-ndcg.mjs [datasetPath] [k]
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const datasetPath = await resolveDatasetPath(process.argv[2]);
const kArg = Number.parseInt(process.argv[3] || "10", 10);
const k = Number.isNaN(kArg) ? 10 : Math.max(1, kArg);
const modelPath = process.env.XGBOOST_RERANKER_MODEL_PATH
  ? resolve(process.env.XGBOOST_RERANKER_MODEL_PATH)
  : resolve("models/xgboost-reranker.json");

const content = await readFile(datasetPath, "utf8");
const rows = content
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const groups = new Map();
for (const row of rows) {
  const key = row.feed_request_id;
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const model = await maybeLoadModel(modelPath);
const metrics = {
  production: [],
  heuristic: [],
  phase2: [],
  model: [],
};

for (const groupRows of groups.values()) {
  if (groupRows.length < 2) continue;

  const productionOrder = [...groupRows].sort((a, b) => {
    const ar = a.served_rank === null ? 9999 : a.served_rank;
    const br = b.served_rank === null ? 9999 : b.served_rank;
    return ar - br;
  });
  const heuristicOrder = [...groupRows].sort(
    (a, b) => Number(b.base_score || 0) - Number(a.base_score || 0)
  );
  const phase2Order = [...groupRows].sort(
    (a, b) => Number(b.final_score || 0) - Number(a.final_score || 0)
  );

  metrics.production.push(ndcgAtK(productionOrder, k));
  metrics.heuristic.push(ndcgAtK(heuristicOrder, k));
  metrics.phase2.push(ndcgAtK(phase2Order, k));

  if (model) {
    const modelOrder = [...groupRows]
      .map((row) => ({
        ...row,
        model_score: predictWithModel(row.features || {}, model),
      }))
      .sort((a, b) => b.model_score - a.model_score);
    metrics.model.push(ndcgAtK(modelOrder, k));
  }
}

console.log(`Dataset: ${datasetPath}`);
console.log(`Requests evaluated: ${metrics.phase2.length}`);
console.log(`NDCG@${k}`);
console.log(`- production order: ${formatMetric(metrics.production)}`);
console.log(`- heuristic score:  ${formatMetric(metrics.heuristic)}`);
console.log(`- phase2 score:     ${formatMetric(metrics.phase2)}`);
if (metrics.model.length > 0) {
  console.log(`- xgboost model:    ${formatMetric(metrics.model)}`);
} else {
  console.log("- xgboost model:    n/a (no model loaded)");
}

async function resolveDatasetPath(inputPath) {
  if (inputPath) return resolve(inputPath);

  const tmpDir = resolve("tmp");
  let files = [];
  try {
    files = await readdir(tmpDir);
  } catch {
    throw new Error("No dataset path provided and ./tmp does not exist.");
  }

  const candidates = files
    .filter((name) => name.startsWith("training-dataset-") && name.endsWith(".jsonl"))
    .sort();

  if (candidates.length === 0) {
    throw new Error("No training dataset files found in ./tmp.");
  }

  return resolve(tmpDir, candidates[candidates.length - 1]);
}

function ndcgAtK(items, kValue) {
  const gains = items.map((item) => Number(item.reward || 0));
  const dcg = computeDcg(gains.slice(0, kValue));
  const ideal = [...gains].sort((a, b) => b - a);
  const idealDcg = computeDcg(ideal.slice(0, kValue));
  if (idealDcg <= 0) return 0;
  return dcg / idealDcg;
}

function computeDcg(gains) {
  let sum = 0;
  for (let i = 0; i < gains.length; i++) {
    const gain = gains[i];
    const numerator = Math.pow(2, gain) - 1;
    const denominator = Math.log2(i + 2);
    sum += numerator / denominator;
  }
  return sum;
}

function formatMetric(values) {
  if (!values.length) return "n/a";
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  return mean.toFixed(4);
}

async function maybeLoadModel(path) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed.modelType !== "xgboost_tree" ||
      !Array.isArray(parsed.featureOrder) ||
      !Array.isArray(parsed.trees)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function predictWithModel(features, model) {
  const vector = model.featureOrder.map((name) => features[name] ?? 0);
  let margin = Number(model.baseScore || 0);
  for (const tree of model.trees) {
    margin += evaluateTree(tree, vector);
  }

  if (model.objective === "binary:logistic") {
    return 1 / (1 + Math.exp(-margin));
  }

  return margin;
}

function evaluateTree(tree, vector) {
  if (!tree.nodes || tree.nodes.length === 0) return 0;

  let idx = 0;
  let guard = 0;
  while (guard < 2048) {
    guard++;
    const node = tree.nodes[idx];
    if (!node) return 0;
    if (typeof node.leaf === "number") return node.leaf;

    const value = vector[node.feature] ?? 0;
    if (Number.isNaN(value)) {
      idx = node.defaultLeft ? node.left : node.right;
    } else {
      idx = value < node.threshold ? node.left : node.right;
    }
    if (idx < 0) return 0;
  }

  return 0;
}
