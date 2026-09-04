#!/usr/bin/env node
/**
 * config.mjs — config global em camadas (home → workspace → task → feature)
 *
 *   sddharness config list
 *   sddharness config set runtime herdr
 *   sddharness config set --task PROJ-123 implementer executor opencode
 *   sddharness config set --feature feature-01 reviewer executor claude
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const REPO_ROOT = process.cwd();

export const ROLES = [
  "leader",
  "docs_filler",
  "jira_importer",
  "spec_author",
  "coordinator",
  "implementer",
  "reviewer",
];
export const EXECUTORS = ["claude", "codex", "cursor", "opencode"];
export const RUNTIMES = ["native", "herdr"];
export const MODES = ["plan", "agent", "ask"];
export const CAP_KEYS = ["read", "writeSpec", "writeCode", "execute"];
export const EFFORTS = [
  "inherit",
  "low",
  "medium",
  "high",
  "xhigh",
  "none",
  "minimal",
  "max",
  "ultra",
];

const DEFAULT_CAPS = {
  leader: { read: true, writeSpec: false, writeCode: false, execute: true },
  docs_filler: { read: true, writeSpec: true, writeCode: false, execute: false },
  jira_importer: { read: true, writeSpec: true, writeCode: false, execute: false },
  spec_author: { read: true, writeSpec: true, writeCode: false, execute: false },
  coordinator: { read: true, writeSpec: false, writeCode: false, execute: true },
  implementer: { read: true, writeSpec: false, writeCode: true, execute: true },
  reviewer: { read: true, writeSpec: false, writeCode: false, execute: true },
};

const DEFAULT_EFFORT = {
  leader: "medium",
  docs_filler: "low",
  jira_importer: "low",
  spec_author: "medium",
  coordinator: "high",
  implementer: "high",
  reviewer: "low",
};

const DEFAULT_MODES = {
  spec_author: "plan",
  implementer: "agent",
  reviewer: "ask",
};

const REPO_ONLY_KEYS = ["verifyCmd"];

function fail(msg) {
  console.error(`[FAIL]  ${msg}`);
  process.exit(1);
}

export function harnessHomeFromEnv(env = process.env) {
  if (env.SDDHARNESS_HOME) return env.SDDHARNESS_HOME;
  return join(env.HOME || env.USERPROFILE || homedir(), ".sddharness");
}

export function defaultAgent(role) {
  const agent = {
    executor: "claude",
    model: "inherit",
    effort: DEFAULT_EFFORT[role] || "inherit",
    capabilities: { ...DEFAULT_CAPS[role] },
  };
  if (DEFAULT_MODES[role]) agent.mode = DEFAULT_MODES[role];
  return agent;
}

export function emptyConfig() {
  const agents = {};
  for (const role of ROLES) agents[role] = defaultAgent(role);
  return {
    runtime: "herdr",
    agents,
    orchestration: { maxReviewCycles: 3, maxParallel: 3 },
    quota: { sessionPct: 90, weeklyPct: 95, warnSessionPct: 70, warnWeeklyPct: 80 },
    models: {},
  };
}

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function homeConfigPath(home) {
  return join(home, "config.json");
}

export function workspaceConfigPath(home, name) {
  return join(home, "workspaces", name, "config.json");
}

function stripOverlays(raw) {
  if (!raw || typeof raw !== "object") return {};
  const { tasks, features, ...rest } = raw;
  return rest;
}

function mergeAgents(base = {}, overlay = {}) {
  const out = { ...base };
  for (const [role, agent] of Object.entries(overlay)) {
    const prev = out[role] || {};
    out[role] = {
      ...prev,
      ...agent,
      capabilities: { ...(prev.capabilities || {}), ...(agent.capabilities || {}) },
    };
  }
  return out;
}

export function mergeLayer(base, overlay) {
  if (!overlay || typeof overlay !== "object") return base;
  const layer = stripOverlays(overlay);
  return {
    ...base,
    ...layer,
    agents: mergeAgents(base.agents, layer.agents),
    orchestration: { ...(base.orchestration || {}), ...(layer.orchestration || {}) },
    quota: { ...(base.quota || {}), ...(layer.quota || {}) },
    models: { ...(base.models || {}), ...(layer.models || {}) },
  };
}

export function readRepoLocal(repo = REPO_ROOT) {
  const raw = readJson(join(repo, ".sddharness", "config.json"), {});
  const out = {};
  for (const key of REPO_ONLY_KEYS) {
    if (raw && raw[key] != null && raw[key] !== "") out[key] = raw[key];
  }
  return out;
}

export function detectWorkspaceName(home, cwd = REPO_ROOT) {
  const abs = resolve(cwd);
  const dir = join(home, "workspaces");
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      const wsDir = join(dir, name);
      try {
        if (!statSync(wsDir).isDirectory()) continue;
      } catch {
        continue;
      }
      if (resolve(wsDir) === abs) return name;
      const ws = readJson(join(wsDir, "workspace.json"), null);
      for (const r of ws?.repos || []) {
        const p = resolve(r.path);
        if (abs === p || abs.startsWith(p + "/")) return name;
      }
    }
  }
  return readJson(join(home, "current.json"), null)?.name || null;
}

function normalizeOpts(opts = {}) {
  if (typeof opts === "string") opts = { repo: opts };
  const env = opts.env || process.env;
  const home = opts.home || harnessHomeFromEnv(env);
  const cwd = opts.cwd || opts.repo || REPO_ROOT;
  const workspace = opts.workspace !== undefined ? opts.workspace : detectWorkspaceName(home, cwd);
  return {
    home,
    cwd,
    workspace,
    feature: opts.feature || null,
    task: opts.task || null,
    repo: opts.repo || cwd,
  };
}

export function resolveScope(opts = {}) {
  const n = normalizeOpts(opts);
  if (n.feature) return { ...n, label: `feature ${n.feature}` };
  if (n.task) return { ...n, label: `tarefa ${n.task}` };
  if (n.workspace) return { ...n, label: `workspace ${n.workspace}` };
  return { ...n, label: "home" };
}

export function readConfig(opts = {}) {
  const n = normalizeOpts(opts);
  const homeRaw = readJson(homeConfigPath(n.home), {}) || {};
  const wsRaw = n.workspace
    ? readJson(workspaceConfigPath(n.home, n.workspace), {}) || {}
    : {};
  let cfg = mergeLayer(emptyConfig(), homeRaw);
  cfg = mergeLayer(cfg, wsRaw);
  const taskLayer = (n.task && (wsRaw.tasks?.[n.task] || homeRaw.tasks?.[n.task])) || null;
  if (taskLayer) cfg = mergeLayer(cfg, taskLayer);
  const featLayer =
    (n.feature && (wsRaw.features?.[n.feature] || homeRaw.features?.[n.feature])) || null;
  if (featLayer) cfg = mergeLayer(cfg, featLayer);
  return { ...cfg, ...readRepoLocal(n.repo) };
}

function targetFile(n) {
  if (n.workspace) return workspaceConfigPath(n.home, n.workspace);
  return homeConfigPath(n.home);
}

export function persistSet(args, opts = {}) {
  const n = normalizeOpts(opts);
  const file = targetFile(n);
  const raw = readJson(file, {}) || {};
  if (n.feature) {
    const layer = raw.features?.[n.feature] || {};
    const next = applySet(layer, args, { sparse: true });
    writeJson(file, {
      ...raw,
      features: { ...(raw.features || {}), [n.feature]: next },
    });
    return readConfig(n);
  }
  if (n.task) {
    const layer = raw.tasks?.[n.task] || {};
    const next = applySet(layer, args, { sparse: true });
    writeJson(file, {
      ...raw,
      tasks: { ...(raw.tasks || {}), [n.task]: next },
    });
    return readConfig(n);
  }
  const { tasks, features, ...layer } = raw;
  const next = applySet(layer, args, { sparse: true });
  writeJson(file, { ...next, tasks, features });
  return readConfig(n);
}

function parseBool(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  fail(`capabilities exigem true|false, recebi: ${raw}`);
}

function parseFallbackOrder(raw) {
  const list = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const ex of list) {
    if (!EXECUTORS.includes(ex)) fail(`executor inválido em fallbackOrder: ${ex}`);
  }
  return list;
}

function setRuntime(cfg, value) {
  if (!RUNTIMES.includes(value)) fail(`runtime inválido: ${value} (native|herdr)`);
  return { ...cfg, runtime: value };
}

function setQuota(cfg, key, value) {
  const keys = ["sessionPct", "weeklyPct", "warnSessionPct", "warnWeeklyPct"];
  if (!keys.includes(key)) fail(`quota desconhecida: ${key}`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) fail(`quota ${key} deve ser 0-100`);
  return { ...cfg, quota: { ...(cfg.quota || {}), [key]: n } };
}

function setOrchestration(cfg, key, value) {
  const orch = { ...(cfg.orchestration || {}) };
  if (key === "maxReviewCycles") {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) fail("maxReviewCycles deve ser inteiro >= 1");
    orch.maxReviewCycles = n;
  } else if (key === "maxParallel") {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) fail("maxParallel deve ser inteiro >= 1");
    orch.maxParallel = n;
  } else if (key === "fallbackOrder") {
    orch.fallbackOrder = parseFallbackOrder(value);
  } else {
    fail(`orchestration desconhecida: ${key}`);
  }
  return { ...cfg, orchestration: orch };
}

function setAgentField(cfg, role, field, value, sparse) {
  if (!ROLES.includes(role)) fail(`agente desconhecido: ${role}`);
  const prev = cfg.agents?.[role] || (sparse ? {} : defaultAgent(role));
  const next = { ...prev };
  if (prev.capabilities || field.startsWith("capabilities.")) {
    next.capabilities = { ...(prev.capabilities || (sparse ? {} : DEFAULT_CAPS[role])) };
  }
  if (field === "executor") {
    if (!EXECUTORS.includes(value)) fail(`executor inválido: ${value}`);
    next.executor = value;
  } else if (field === "model") {
    next.model = value;
  } else if (field === "effort") {
    if (!EFFORTS.includes(value)) fail(`effort inválido: ${value}`);
    next.effort = value;
  } else if (field === "mode") {
    if (!MODES.includes(value)) fail(`mode inválido: ${value} (plan|agent|ask)`);
    next.mode = value;
  } else if (field.startsWith("capabilities.")) {
    const cap = field.slice("capabilities.".length);
    if (!CAP_KEYS.includes(cap)) fail(`capability desconhecida: ${cap}`);
    next.capabilities = { ...(next.capabilities || {}), [cap]: parseBool(value) };
  } else {
    fail(`campo inválido: ${field}`);
  }
  let agents = { ...(cfg.agents || {}), [role]: next };
  if (field === "executor" && (role === "implementer" || role === "coordinator")) {
    const other = role === "implementer" ? "coordinator" : "implementer";
    const prevOther = agents[other] || (sparse ? {} : defaultAgent(other));
    agents = { ...agents, [other]: { ...prevOther, executor: value } };
  }
  return { ...cfg, agents };
}

function setModelEffort(cfg, slug, field, value) {
  if (field !== "effort") fail(`campo de modelo inválido: ${field}`);
  if (!EFFORTS.includes(value)) fail(`effort inválido: ${value}`);
  return {
    ...cfg,
    models: { ...(cfg.models || {}), [slug]: { ...(cfg.models?.[slug] || {}), effort: value } },
  };
}

export function applySet(cfg, args, { sparse = false } = {}) {
  if (args.length < 2) fail("usage: set <runtime|quota|orchestration|role|model> ...");
  const [target, a, b, c] = args;
  if (target === "runtime") return setRuntime(cfg, a);
  if (target === "quota") return setQuota(cfg, a, b);
  if (target === "orchestration") return setOrchestration(cfg, a, b);
  if (target === "model") return setModelEffort(cfg, a, b, c);
  if (ROLES.includes(target)) return setAgentField(cfg, target, a, b, sparse);
  fail(`alvo inválido: ${target}`);
}

function capSummary(caps) {
  if (!caps) return "-";
  return CAP_KEYS.filter((k) => caps[k]).join(",") || "-";
}

function displayAgent(role, raw) {
  const base = defaultAgent(role);
  return {
    executor: raw?.executor || base.executor,
    model: raw?.model || "inherit",
    effort: raw?.effort || base.effort || "inherit",
    mode: raw?.mode || base.mode || "-",
    capabilities: { ...base.capabilities, ...(raw?.capabilities || {}) },
  };
}

export function formatList(cfg, scopeLabel = "home") {
  const orch = cfg.orchestration || {};
  const quota = cfg.quota || { sessionPct: 90, weeklyPct: 95 };
  const order = orch.fallbackOrder
    ? orch.fallbackOrder.join(", ")
    : "(não definido — fallback pergunta ao usuário)";
  const lines = [
    `escopo: ${scopeLabel}`,
    `runtime: ${cfg.runtime || "herdr"}`,
    `maxReviewCycles: ${orch.maxReviewCycles ?? 3}`,
    `maxParallel: ${orch.maxParallel ?? 3}`,
    `fallbackOrder: ${order}`,
    `quota: warn sessão ${quota.warnSessionPct ?? 70}% / ciclo ${quota.warnWeeklyPct ?? 80}% | block sessão ${quota.sessionPct ?? 90}% / ciclo ${quota.weeklyPct ?? 95}%`,
    "",
    "role            executor  model     effort    mode   capabilities",
  ];
  for (const role of ROLES) {
    const a = displayAgent(role, cfg.agents?.[role]);
    lines.push(
      `${role.padEnd(16)}${a.executor.padEnd(10)}${String(a.model).padEnd(10)}${String(a.effort).padEnd(10)}${String(a.mode).padEnd(7)}${capSummary(a.capabilities)}`
    );
  }
  if (cfg.verifyCmd) lines.push("", `verifyCmd: ${cfg.verifyCmd}`);
  return lines.join("\n") + "\n";
}

export function parseScopeArgs(argv) {
  const out = { task: null, feature: null, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--task") out.task = argv[++i];
    else if (argv[i] === "--feature") out.feature = argv[++i];
    else out.rest.push(argv[i]);
  }
  return out;
}

function usage() {
  console.log(`Usage:
  sddharness config get
  sddharness config list [--task KEY] [--feature feature-XX]
  sddharness config set [--task KEY] [--feature feature-XX] runtime native|herdr
  sddharness config set [--task KEY] [--feature feature-XX] <role> executor|model|mode|effort <valor>
  sddharness config set <role> capabilities.<key> true|false
  sddharness config set model <slug> effort <valor>
  sddharness config set orchestration maxReviewCycles <n>
  sddharness config set orchestration maxParallel <n>
  sddharness config set orchestration fallbackOrder cursor,codex,claude,opencode
  sddharness config set quota sessionPct|weeklyPct|warnSessionPct|warnWeeklyPct <n>`);
}

export function writeConfig(cfg, root = REPO_ROOT) {
  writeJson(join(root, ".sddharness", "config.json"), cfg);
}

function main(argv) {
  const parsed = parseScopeArgs(argv);
  const cmd = parsed.rest[0];
  const opts = { task: parsed.task, feature: parsed.feature };
  if (cmd === "get") {
    console.log(JSON.stringify(readConfig(opts), null, 2));
    return;
  }
  if (cmd === "list") {
    const scope = resolveScope(opts);
    process.stdout.write(formatList(readConfig(opts), scope.label));
    return;
  }
  if (cmd === "set") {
    persistSet(parsed.rest.slice(1), opts);
    return;
  }
  usage();
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
