#!/usr/bin/env node
/**
 * config.mjs — lê e grava .sddharness/config.json
 *
 *   node sddharness/scripts/config.mjs get
 *   node sddharness/scripts/config.mjs list
 *   node sddharness/scripts/config.mjs set runtime herdr
 *   node sddharness/scripts/config.mjs set spec_author executor cursor
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

export const ROLES = [
  "leader",
  "docs_filler",
  "jira_importer",
  "spec_author",
  "implementer",
  "reviewer",
];
export const EXECUTORS = ["claude", "codex", "cursor"];
export const RUNTIMES = ["native", "herdr"];
export const MODES = ["plan", "agent", "ask"];
export const CAP_KEYS = ["read", "writeSpec", "writeCode", "execute"];

const DEFAULT_CAPS = {
  leader: { read: true, writeSpec: false, writeCode: false, execute: true },
  docs_filler: { read: true, writeSpec: true, writeCode: false, execute: false },
  jira_importer: { read: true, writeSpec: true, writeCode: false, execute: false },
  spec_author: { read: true, writeSpec: true, writeCode: false, execute: false },
  implementer: { read: true, writeSpec: false, writeCode: true, execute: true },
  reviewer: { read: true, writeSpec: false, writeCode: false, execute: true },
};

const DEFAULT_MODES = {
  spec_author: "plan",
  implementer: "agent",
  reviewer: "ask",
};

function fail(msg) {
  console.error(`[FAIL]  ${msg}`);
  process.exit(1);
}

export function defaultAgent(role) {
  const agent = { executor: "claude", model: "inherit", capabilities: { ...DEFAULT_CAPS[role] } };
  if (DEFAULT_MODES[role]) agent.mode = DEFAULT_MODES[role];
  return agent;
}

export function emptyConfig() {
  const agents = {};
  for (const role of ROLES) agents[role] = defaultAgent(role);
  return {
    runtime: "native",
    agents,
    orchestration: { maxReviewCycles: 3 },
    quota: { sessionPct: 90, weeklyPct: 95 },
  };
}

export function readConfig(root = ROOT) {
  const path = join(root, ".sddharness", "config.json");
  if (!existsSync(path)) return emptyConfig();
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeConfig(cfg, root = ROOT) {
  const dir = join(root, ".sddharness");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify(cfg, null, 2) + "\n");
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
  if (key !== "sessionPct" && key !== "weeklyPct") fail(`quota desconhecida: ${key}`);
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
  } else if (key === "fallbackOrder") {
    orch.fallbackOrder = parseFallbackOrder(value);
  } else {
    fail(`orchestration desconhecida: ${key}`);
  }
  return { ...cfg, orchestration: orch };
}

function setAgentField(cfg, role, field, value) {
  if (!ROLES.includes(role)) fail(`agente desconhecido: ${role}`);
  const prev = cfg.agents?.[role] || defaultAgent(role);
  const next = { ...prev, capabilities: { ...(prev.capabilities || DEFAULT_CAPS[role]) } };
  if (field === "executor") {
    if (!EXECUTORS.includes(value)) fail(`executor inválido: ${value}`);
    next.executor = value;
  } else if (field === "model") {
    next.model = value;
  } else if (field === "mode") {
    if (!MODES.includes(value)) fail(`mode inválido: ${value} (plan|agent|ask)`);
    next.mode = value;
  } else if (field.startsWith("capabilities.")) {
    const cap = field.slice("capabilities.".length);
    if (!CAP_KEYS.includes(cap)) fail(`capability desconhecida: ${cap}`);
    next.capabilities = { ...next.capabilities, [cap]: parseBool(value) };
  } else {
    fail(`campo inválido: ${field}`);
  }
  return { ...cfg, agents: { ...(cfg.agents || {}), [role]: next } };
}

export function applySet(cfg, args) {
  if (args.length < 2) fail("usage: set <runtime|quota|orchestration|role> ...");
  const [target, a, b] = args;
  if (target === "runtime") return setRuntime(cfg, a);
  if (target === "quota") return setQuota(cfg, a, b);
  if (target === "orchestration") return setOrchestration(cfg, a, b);
  if (ROLES.includes(target)) return setAgentField(cfg, target, a, b);
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
    mode: raw?.mode || base.mode || "-",
    capabilities: { ...base.capabilities, ...(raw?.capabilities || {}) },
  };
}

export function formatList(cfg) {
  const orch = cfg.orchestration || {};
  const quota = cfg.quota || { sessionPct: 90, weeklyPct: 95 };
  const order = orch.fallbackOrder
    ? orch.fallbackOrder.join(", ")
    : "(não definido — fallback pergunta ao usuário)";
  const lines = [
    `runtime: ${cfg.runtime || "native"}`,
    `maxReviewCycles: ${orch.maxReviewCycles ?? 3}`,
    `fallbackOrder: ${order}`,
    `quota: sessão >= ${quota.sessionPct ?? 90}% | ciclo (semanal/mensal) >= ${quota.weeklyPct ?? 95}% → claude, codex e cursor indisponíveis`,
    "",
    "role            executor  model     mode   capabilities",
  ];
  for (const role of ROLES) {
    const a = displayAgent(role, cfg.agents?.[role]);
    lines.push(
      `${role.padEnd(16)}${a.executor.padEnd(10)}${String(a.model).padEnd(10)}${String(a.mode).padEnd(7)}${capSummary(a.capabilities)}`
    );
  }
  return lines.join("\n") + "\n";
}

function usage() {
  console.log(`Usage:
  config.mjs get
  config.mjs list
  config.mjs set runtime native|herdr
  config.mjs set <role> executor|model|mode <valor>
  config.mjs set <role> capabilities.<key> true|false
  config.mjs set orchestration maxReviewCycles <n>
  config.mjs set orchestration fallbackOrder cursor,codex,claude
  config.mjs set quota sessionPct|weeklyPct <n>`);
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === "get") {
    console.log(JSON.stringify(readConfig(), null, 2));
    return;
  }
  if (cmd === "list") {
    process.stdout.write(formatList(readConfig()));
    return;
  }
  if (cmd === "set") {
    writeConfig(applySet(readConfig(), argv.slice(1)));
    return;
  }
  usage();
  process.exit(cmd ? 1 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
