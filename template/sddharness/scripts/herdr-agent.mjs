#!/usr/bin/env node
/**
 * herdr-agent.mjs — fachada Herdr (spawn / prompt / wait / read / run)
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig } from "./config.mjs";
import { ClaudeProvider } from "./runtime/providers/claude.mjs";
import { CodexProvider } from "./runtime/providers/codex.mjs";
import { CursorProvider } from "./runtime/providers/cursor.mjs";
import { OpenCodeProvider } from "./runtime/providers/opencode.mjs";
import { resolveExecutor, quotaReason } from "./runtime/fallback.mjs";

const ROOT = process.cwd();
const EXIT_BLOCKED = 2;
const EXIT_NONE = 3;
const EXIT_ASK = 4;

function fail(msg, code = 1) {
  console.error(`[FAIL]  ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    } else {
      out._.push(a);
    }
  }
  return out;
}

export function createProviders() {
  return {
    claude: new ClaudeProvider(),
    codex: new CodexProvider(),
    cursor: new CursorProvider(),
    opencode: new OpenCodeProvider(),
  };
}

function herdr(args) {
  const r = spawnSync("herdr", args, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  return r;
}

function parseJson(stdout) {
  const start = (stdout || "").indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
}

function requireHerdrRuntime(cfg) {
  if ((cfg.runtime || "native") !== "herdr") {
    fail("runtime não é herdr — use sddharness config set runtime herdr");
  }
  if (process.env.HERDR_ENV !== "1") {
    fail("rode o leader dentro do Herdr (sddharness start). HERDR_ENV=1 ausente");
  }
}

function printProbes(probes) {
  for (const [name, probe] of Object.entries(probes || {})) {
    console.error(quotaReason(name, probe));
  }
}

async function pickExecutor(cfg, role, override) {
  const agent = cfg.agents?.[role] || {};
  const result = await resolveExecutor({
    configured: agent.executor || "claude",
    providers: createProviders(),
    quota: cfg.quota,
    fallbackOrder: cfg.orchestration?.fallbackOrder,
    override,
  });
  if (result.error === "none") {
    printProbes(result.probes);
    fail("nenhum executor disponível — pare e aguarde o usuário", EXIT_NONE);
  }
  if (result.error === "ask") {
    printProbes(result.probes);
    console.error(`executors disponíveis: ${result.available.join(", ")}`);
    fail("escolha um executor (fallbackOrder ausente)", EXIT_ASK);
  }
  if (result.announced) console.log(result.announced);
  return result.executor;
}

export function agentName(role, feature) {
  const feat = feature && feature !== true ? String(feature) : "";
  if (!feat) return role;
  return `${role}-${feat}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 32);
}

function providerFor(executor) {
  return createProviders()[executor];
}

function splitPane(cwd) {
  const args = ["pane", "split", "--current", "--direction", "right", "--no-focus"];
  if (cwd) args.push("--cwd", cwd);
  const r = herdr(args);
  const json = parseJson(r.stdout);
  const paneId = json?.result?.pane?.pane_id;
  if (!paneId) fail(`herdr pane split falhou: ${(r.stderr || r.stdout || "").trim()}`);
  return paneId;
}

function startAgent(name, executor, paneId, agentCfg) {
  const extras = providerFor(executor).buildStartArgs({
    model: agentCfg.model,
    mode: agentCfg.mode,
    effort: agentCfg.effort,
    capabilities: agentCfg.capabilities,
  });
  const args = ["agent", "start", name, "--kind", executor, "--pane", paneId];
  if (extras.length) args.push("--", ...extras);
  const r = herdr(args);
  if (r.status !== 0) fail(`herdr agent start falhou: ${(r.stderr || r.stdout || "").trim()}`);
}

function existingAgent(name) {
  const json = parseJson(herdr(["agent", "list"]).stdout);
  return (json?.result?.agents || []).find((a) => a.name === name) || null;
}

function ensureAgent(name, executor, cwd, agentCfg) {
  const hit = existingAgent(name);
  if (hit?.pane_id) return hit.pane_id;
  const paneId = splitPane(cwd);
  startAgent(name, executor, paneId, agentCfg);
  return paneId;
}

function recordAgent({ feature, role, executor, paneId, model, resolved }) {
  if (!feature) return;
  const script = join(ROOT, "sddharness", "scripts", "git-session.mjs");
  if (!existsSync(script)) return;
  const args = [
    script,
    "record-agent",
    "--feature",
    feature,
    "--role",
    role,
    "--executor",
    executor,
    "--pane",
    paneId,
  ];
  if (model) args.push("--model", model);
  if (resolved) args.push("--resolved", resolved);
  spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
}

export function cmdSpawn(args, cfg) {
  requireHerdrRuntime(cfg);
  const role = args.role;
  if (!role) fail("usage: spawn --role <role> --cwd <abs> [--feature feature-01]");
  return pickExecutor(cfg, role, args.executor).then((executor) => {
    const name = agentName(role, args.feature);
    const paneId = ensureAgent(name, executor, args.cwd, cfg.agents?.[role] || {});
    recordAgent({
      feature: args.feature,
      role,
      executor: cfg.agents?.[role]?.executor || executor,
      paneId,
      model: cfg.agents?.[role]?.model,
      resolved: executor !== (cfg.agents?.[role]?.executor || executor) ? executor : undefined,
    });
    console.log(JSON.stringify({ role, name, executor, paneId }, null, 2));
    return { role, name, executor, paneId };
  });
}

function promptWait(name, prompt) {
  const r = herdr([
    "agent",
    "prompt",
    name,
    prompt,
    "--wait",
    "--until",
    "idle",
    "--until",
    "done",
    "--until",
    "blocked",
  ]);
  const json = parseJson(r.stdout) || parseJson(r.stderr);
  const status = json?.result?.agent?.status;
  const blocked =
    r.status !== 0 ||
    status === "blocked" ||
    /agent_blocked/.test(r.stderr || "");
  return { blocked, stdout: r.stdout, stderr: r.stderr };
}

function cmdPrompt(args) {
  const role = args.role;
  const prompt = args.prompt;
  if (!role || !prompt) fail("usage: prompt --role <role> --prompt '...' [--feature feature-01]");
  const name = agentName(role, args.feature);
  const result = promptWait(name, String(prompt));
  if (result.blocked) {
    cmdRead({ role, feature: args.feature, lines: args.lines || 80 });
    process.exit(EXIT_BLOCKED);
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

function cmdWait(args) {
  const role = args.role;
  if (!role) fail("usage: wait --role <role> [--feature feature-01]");
  const name = agentName(role, args.feature);
  const r = herdr(["agent", "wait", name, "--until", "idle", "--until", "done", "--until", "blocked"]);
  process.stdout.write(r.stdout || "");
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function cmdRead(args) {
  const role = args.role;
  if (!role) fail("usage: read --role <role> [--feature feature-01]");
  const name = agentName(role, args.feature);
  const r = herdr([
    "agent",
    "read",
    name,
    "--source",
    "recent-unwrapped",
    "--lines",
    String(args.lines || 120),
  ]);
  process.stdout.write(r.stdout || "");
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function cmdRun(args, cfg) {
  requireHerdrRuntime(cfg);
  const role = args.role;
  if (!role) fail("usage: run --role <role> --cwd <abs> [--feature feature-01] [--prompt '...']");
  const executor = await pickExecutor(cfg, role, args.executor);
  const name = agentName(role, args.feature);
  const agentCfg = cfg.agents?.[role] || {};
  const paneId = ensureAgent(name, executor, args.cwd, agentCfg);
  recordAgent({
    feature: args.feature,
    role,
    executor: agentCfg.executor || executor,
    paneId,
    model: agentCfg.model,
    resolved: executor !== (agentCfg.executor || executor) ? executor : undefined,
  });
  if (executor !== (agentCfg.executor || executor)) {
    console.log(`executor definido: ${executor}`);
  }
  const provider = providerFor(executor);
  const preamble = provider.buildPromptPreamble({
    role,
    harnessRoot: ROOT,
    worktree: args.cwd,
    capabilities: agentCfg.capabilities,
    effort: agentCfg.effort,
  });
  const user = args.prompt && args.prompt !== true ? String(args.prompt) : `Execute ${role}.`;
  const result = promptWait(name, `${preamble}\n\n${user}`);
  if (result.blocked) {
    cmdRead({ role, feature: args.feature, lines: 80 });
    process.exit(EXIT_BLOCKED);
  }
  cmdRead({ role, feature: args.feature, lines: args.lines || 120 });
}

function usage() {
  console.log(`Usage:
  herdr-agent.mjs spawn --role <role> --cwd <abs> [--feature feature-01]
  herdr-agent.mjs prompt --role <role> --prompt "..." [--feature feature-01]
  herdr-agent.mjs wait --role <role> [--feature feature-01]
  herdr-agent.mjs read --role <role> [--feature feature-01]
  herdr-agent.mjs run --role <role> --cwd <abs> [--feature feature-01] [--prompt "..."]`);
}

async function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  const cfg = readConfig({
    feature: args.feature && args.feature !== true ? String(args.feature) : null,
    cwd: args.cwd && args.cwd !== true ? String(args.cwd) : ROOT,
    repo: args.cwd && args.cwd !== true ? String(args.cwd) : ROOT,
  });
  if (cmd === "spawn") await cmdSpawn(args, cfg);
  else if (cmd === "prompt") {
    requireHerdrRuntime(cfg);
    cmdPrompt(args);
  } else if (cmd === "wait") {
    requireHerdrRuntime(cfg);
    cmdWait(args);
  } else if (cmd === "read") {
    requireHerdrRuntime(cfg);
    cmdRead(args);
  } else if (cmd === "run") await cmdRun(args, cfg);
  else {
    usage();
    process.exit(1);
  }
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    fail(err.message || String(err));
  });
}
