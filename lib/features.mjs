import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mapJiraComponent, suggestRepos } from "./workspace.mjs";

export function nextFeatureName(features) {
  let max = 0;
  for (const feature of features ?? []) {
    const match = String(feature.name || "").match(/^feature-(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `feature-${String(max + 1).padStart(2, "0")}`;
}

export function assignRepo({ text, component, repos, workspace, explicit }) {
  if (explicit) {
    const hit = (repos || []).find((r) => r.id === explicit || r.path === explicit);
    if (hit) return { repo: hit.id, ambiguous: false };
    return { repo: explicit, ambiguous: false };
  }
  const fromJira = component ? mapJiraComponent(workspace, component) : null;
  if (fromJira) return { repo: fromJira, ambiguous: false };
  const guessed = suggestRepos(text, repos);
  if (guessed.length === 1) return { repo: guessed[0].id, ambiguous: false };
  return {
    repo: null,
    ambiguous: true,
    candidates: guessed.length ? guessed.map((r) => r.id) : (repos || []).map((r) => r.id),
  };
}

export function splitByRepo(features) {
  const groups = {};
  for (const f of features || []) {
    const key = f.repo || "_unset";
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  }
  return groups;
}

export function sameEpicKey(features, fallbackKey) {
  const keys = new Set(
    (features || []).map((f) => f.jira_key || fallbackKey || null)
  );
  return keys.size <= 1;
}

export function canRunParallel(features, sourceKey) {
  if (!features?.length) return true;
  const keys = features.map((f) => f.jira_key || sourceKey || null);
  if (keys.some((k) => !k)) return features.length <= 1;
  return new Set(keys).size === 1;
}

export function waveSize(features, maxParallel = 3) {
  return (features || []).slice(0, Math.max(1, maxParallel));
}

export function materializeRepoList(workspaceList, repoId) {
  const features = (workspaceList.features || []).filter((f) => f.repo === repoId);
  return {
    ...workspaceList,
    project: repoId,
    features,
  };
}

export function writeRepoFeatureList(repoRoot, list) {
  const path = join(repoRoot, "sddharness", "feature_list.json");
  mkdirSync(dirname(path), { recursive: true });
  const prev = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  writeFileSync(
    path,
    JSON.stringify({ ...prev, ...list, features: list.features }, null, 2) + "\n"
  );
  return path;
}
