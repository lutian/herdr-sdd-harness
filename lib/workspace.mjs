import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { currentPointerPath, harnessHome, workspaceDir } from "./home.mjs";

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function emptyWorkspace(name) {
  return {
    name,
    repos: [],
    jira: { components: {} },
    createdAt: new Date().toISOString(),
  };
}

export function listWorkspaces(home = harnessHome()) {
  const dir = join(home, "workspaces");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

export function findWorkspaceForCwd(cwd, home = harnessHome()) {
  const abs = resolve(cwd);
  for (const name of listWorkspaces(home)) {
    const dir = resolve(workspaceDir(home, name));
    if (abs === dir || abs.startsWith(dir + "/")) return name;
    const ws = readWorkspace(name, home);
    for (const r of ws?.repos || []) {
      const p = resolve(r.path);
      if (abs === p || abs.startsWith(p + "/")) return name;
    }
  }
  return getCurrentName(home);
}

export function getCurrentName(home = harnessHome()) {
  const ptr = readJson(currentPointerPath(home), null);
  return ptr?.name || null;
}

export function setCurrentName(name, home = harnessHome()) {
  writeJson(currentPointerPath(home), { name });
}

export function readWorkspace(name, home = harnessHome()) {
  const path = join(workspaceDir(home, name), "workspace.json");
  if (!existsSync(path)) return null;
  return readJson(path, null);
}

export function writeWorkspace(ws, home = harnessHome()) {
  const dir = workspaceDir(home, nameOr(ws));
  ensureDir(dir);
  writeJson(join(dir, "workspace.json"), ws);
  return dir;
}

function nameOr(ws) {
  return ws.name;
}

export function createWorkspace(name, home = harnessHome()) {
  if (!name || /[^\w.-]/.test(name)) {
    throw new Error(`nome de workspace inválido: ${name}`);
  }
  const existing = readWorkspace(name, home);
  if (existing) return { workspace: existing, created: false };
  const ws = emptyWorkspace(name);
  writeWorkspace(ws, home);
  writeJson(join(workspaceDir(home, name), "feature_list.json"), {
    workspace: name,
    project: name,
    description: "",
    source: { type: "manual", key: "" },
    rules: {
      one_feature_at_a_time: false,
      require_tests_to_close: true,
      require_approved_spec_to_implement: true,
      valid_status: ["pending", "spec_ready", "in_progress", "done", "blocked"],
    },
    features: [],
  });
  setCurrentName(name, home);
  return { workspace: ws, created: true };
}

export function useWorkspace(name, home = harnessHome()) {
  if (!readWorkspace(name, home)) throw new Error(`workspace não existe: ${name}`);
  setCurrentName(name, home);
  return readWorkspace(name, home);
}

export function requireCurrent(home = harnessHome()) {
  const name = getCurrentName(home);
  if (!name) throw new Error("nenhum workspace ativo — sddharness workspace create <nome>");
  const ws = readWorkspace(name, home);
  if (!ws) throw new Error(`workspace ativo sumiu: ${name}`);
  return ws;
}

export function addRepo(ws, repoPath, { id } = {}, home = harnessHome()) {
  const abs = resolve(repoPath);
  const repoId = id || basename(abs);
  const repos = (ws.repos || []).filter((r) => r.id !== repoId && r.path !== abs);
  const next = { ...ws, repos: [...repos, { id: repoId, path: abs }] };
  writeWorkspace(next, home);
  return { workspace: next, repo: { id: repoId, path: abs } };
}

export function removeRepo(ws, idOrPath, home = harnessHome()) {
  const abs = resolve(idOrPath);
  const next = {
    ...ws,
    repos: (ws.repos || []).filter((r) => r.id !== idOrPath && r.path !== abs),
  };
  writeWorkspace(next, home);
  return next;
}

const LOCK_STALE_MS = 4 * 60 * 60 * 1000;

export function lockPath(name, home = harnessHome()) {
  return join(workspaceDir(home, name), "session.lock");
}

export function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(
  name,
  { pid = process.pid, now = Date.now(), alive = isPidAlive } = {},
  home = harnessHome()
) {
  const path = lockPath(name, home);
  if (existsSync(path)) {
    const prev = readJson(path, {});
    const fresh = prev.at && now - prev.at < LOCK_STALE_MS;
    const holderAlive = Boolean(prev.pid && alive(prev.pid));
    if (fresh && holderAlive && prev.pid !== pid) {
      throw new Error(`workspace ${name} travado pelo pid ${prev.pid}`);
    }
  }
  writeJson(path, { pid, at: now });
  return path;
}

export function releaseLock(name, home = harnessHome()) {
  const path = lockPath(name, home);
  if (existsSync(path)) rmSync(path);
}

export function suggestRepos(text, repos) {
  const hay = String(text || "").toLowerCase();
  return (repos || []).filter((r) => {
    const id = String(r.id || "").toLowerCase();
    const path = String(r.path || "").toLowerCase();
    return hay.includes(id) || hay.includes(basename(path).toLowerCase());
  });
}

export function mapJiraComponent(ws, component) {
  const map = ws?.jira?.components || {};
  return map[component] || null;
}

export function workspaceFeatureListPath(name, home = harnessHome()) {
  return join(workspaceDir(home, name), "feature_list.json");
}
