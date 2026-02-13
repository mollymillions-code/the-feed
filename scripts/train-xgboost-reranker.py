#!/usr/bin/env python3
"""
Train an XGBoost reranker from exported JSONL dataset and emit runtime model JSON.

Usage:
  python3 scripts/train-xgboost-reranker.py [dataset_path] [output_model_path]

Example:
  python3 scripts/train-xgboost-reranker.py tmp/training-dataset.jsonl models/xgboost-reranker.json
"""

import json
import math
import os
import sys
import tempfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path


def fail(message: str) -> None:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


try:
    import numpy as np
    import xgboost as xgb
except Exception as exc:
    fail(
        "xgboost and numpy are required. Install with: pip install xgboost numpy\n"
        f"Details: {exc}"
    )


def resolve_dataset_path(raw_path: str | None) -> Path:
    if raw_path:
        return Path(raw_path).resolve()

    tmp_dir = Path("tmp")
    if not tmp_dir.exists():
        fail("No dataset path provided and ./tmp does not exist.")

    candidates = sorted(
        [p for p in tmp_dir.iterdir() if p.name.startswith("training-dataset-") and p.suffix == ".jsonl"]
    )
    if not candidates:
        fail("No training dataset files found in ./tmp.")
    return candidates[-1].resolve()


def load_rows(path: Path):
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def build_feature_order(rows):
    keys = set()
    for row in rows:
        features = row.get("features") or {}
        keys.update(features.keys())
    return sorted(keys)


def prepare_rank_data(rows, feature_order):
    grouped = defaultdict(list)
    for row in rows:
        rid = row.get("feed_request_id")
        if not rid:
            continue
        grouped[rid].append(row)

    train_keys = []
    val_keys = []
    sorted_keys = sorted(grouped.keys())
    split_idx = max(1, int(len(sorted_keys) * 0.8))
    train_keys = sorted_keys[:split_idx]
    val_keys = sorted_keys[split_idx:] or sorted_keys[-1:]

    def build_subset(keys):
        matrix = []
        labels = []
        groups = []

        for key in keys:
            group_rows = grouped[key]
            if len(group_rows) < 2:
                continue
            group_rows = sorted(
                group_rows,
                key=lambda row: (
                    row.get("candidate_rank") if row.get("candidate_rank") is not None else 9999
                ),
            )
            groups.append(len(group_rows))

            for row in group_rows:
                feats = row.get("features") or {}
                matrix.append([float(feats.get(name, 0.0)) for name in feature_order])
                labels.append(float(row.get("reward", 0.0)))

        if not matrix or not groups:
            return None

        return np.array(matrix, dtype=np.float32), np.array(labels, dtype=np.float32), groups

    train_data = build_subset(train_keys)
    val_data = build_subset(val_keys)
    if train_data is None:
        fail("Not enough grouped training data. Collect more ranking events first.")
    if val_data is None:
        # fallback: use train as eval if dataset is tiny
        val_data = train_data

    return train_data, val_data


def train_model(train_data, val_data):
    x_train, y_train, group_train = train_data
    x_val, y_val, group_val = val_data

    ranker = xgb.XGBRanker(
        objective="rank:pairwise",
        n_estimators=120,
        learning_rate=0.08,
        max_depth=5,
        min_child_weight=4,
        subsample=0.9,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        random_state=42,
        tree_method="hist",
    )

    ranker.fit(
        x_train,
        y_train,
        group=group_train,
        eval_set=[(x_val, y_val)],
        eval_group=[group_val],
        verbose=False,
    )
    return ranker


def convert_booster_to_runtime_model(booster, feature_order):
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        booster.save_model(tmp_path)
        with open(tmp_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    learner = raw.get("learner", {})
    objective = learner.get("objective", {}).get("name", "rank:pairwise")
    base_score_raw = learner.get("learner_model_param", {}).get("base_score", "0")
    try:
        base_score = float(base_score_raw)
    except Exception:
        base_score = 0.0

    tree_payloads = (
        learner.get("gradient_booster", {})
        .get("model", {})
        .get("trees", [])
    )

    trees = []
    for payload in tree_payloads:
        left_children = [int(v) for v in payload.get("left_children", [])]
        right_children = [int(v) for v in payload.get("right_children", [])]
        split_indices = [int(v) for v in payload.get("split_indices", [])]
        split_conditions = [float(v) for v in payload.get("split_conditions", [])]
        default_left = [bool(v) for v in payload.get("default_left", [])]
        base_weights = [float(v) for v in payload.get("base_weights", [])]

        nodes = []
        for i in range(len(left_children)):
            left = left_children[i]
            right = right_children[i]
            if left == -1 and right == -1:
                leaf_val = base_weights[i] if i < len(base_weights) else 0.0
                nodes.append(
                    {
                        "left": -1,
                        "right": -1,
                        "feature": -1,
                        "threshold": 0.0,
                        "leaf": float(leaf_val),
                    }
                )
                continue

            feature = split_indices[i] if i < len(split_indices) else 0
            threshold = split_conditions[i] if i < len(split_conditions) else 0.0
            dleft = default_left[i] if i < len(default_left) else True
            nodes.append(
                {
                    "left": int(left),
                    "right": int(right),
                    "feature": int(feature),
                    "threshold": float(threshold),
                    "defaultLeft": bool(dleft),
                }
            )

        trees.append({"nodes": nodes})

    return {
        "version": f"xgb-{datetime.utcnow().isoformat(timespec='seconds')}Z",
        "modelType": "xgboost_tree",
        "objective": objective,
        "featureOrder": feature_order,
        "baseScore": base_score,
        "trees": trees,
        "metadata": {
            "treeCount": len(trees),
            "featureCount": len(feature_order),
        },
    }


def main():
    dataset_path = resolve_dataset_path(sys.argv[1] if len(sys.argv) > 1 else None)
    output_path = Path(
        sys.argv[2] if len(sys.argv) > 2 else "models/xgboost-reranker.json"
    ).resolve()

    rows = load_rows(dataset_path)
    if len(rows) < 100:
        fail("Not enough rows to train reliably. Collect more training data first.")

    feature_order = build_feature_order(rows)
    if not feature_order:
        fail("No feature vectors found in dataset.")

    train_data, val_data = prepare_rank_data(rows, feature_order)
    ranker = train_model(train_data, val_data)
    artifact = convert_booster_to_runtime_model(ranker.get_booster(), feature_order)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2)

    print(f"Dataset: {dataset_path}")
    print(f"Model written: {output_path}")
    print(f"Feature count: {len(feature_order)}")
    print(f"Tree count: {len(artifact['trees'])}")


if __name__ == "__main__":
    main()
