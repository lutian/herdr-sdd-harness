import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it, afterEach } from "node:test";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(KIT, "template", "sddharness", "scripts", "config.mjs");

function setup() {
  const home = mkdtempSync(join(tmpdir(), "sdd-cfg-home-"));
  const repo = mkdtempSync(join(tmpdir(), "sdd-cfg-repo-"));
  mkdirSync(join(repo, ".sddharness"), { recursive: true });
  writeFileSync(
    join(repo, ".sddharness", "config.json"),
    JSON.stringify({ verifyCmd: "npm test" }, null, 2) + "\n"
  );
  return { home, repo };
}

function run(ctx, args) {
  return spawnSync(process.execPath, [CONFIG, ...args], {
    cwd: ctx.repo,
    encoding: "utf8",
    env: { ...process.env, SDDHARNESS_HOME: ctx.home },
  });
}

function homeCfg(ctx) {
  const p = join(ctx.home, "config.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function repoCfg(ctx) {
  return JSON.parse(readFileSync(join(ctx.repo, ".sddharness", "config.json"), "utf8"));
}

describe("config.mjs", () => {
  const dirs = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
  });

  it("get prints JSON with runtime herdr by default", () => {
    const ctx = setup();
    dirs.push(ctx.home, ctx.repo);
    const r = run(ctx, ["get"]);
    assert.equal(r.status, 0, r.stderr);
    const cfg = JSON.parse(r.stdout);
    assert.equal(cfg.runtime, "herdr");
    assert.equal(cfg.orchestration.maxReviewCycles, 3);
    assert.ok(!cfg.orchestration.fallbackOrder);
    assert.equal(cfg.verifyCmd, "npm test");
  });

  it("list shows executors, models, escopo and maxReviewCycles", () => {
    const ctx = setup();
    dirs.push(ctx.home, ctx.repo);
    const r = run(ctx, ["list"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /escopo: home/);
    assert.match(r.stdout, /runtime: herdr/);
    assert.match(r.stdout, /maxReviewCycles: 3/);
    assert.match(r.stdout, /fallbackOrder: \(não definido/);
    assert.match(r.stdout, /spec_author\s+claude\s+inherit\s+medium\s+plan/);
    assert.match(r.stdout, /implementer\s+claude\s+inherit/);
  });

  it("set geral writes home and does not alter repo config", () => {
    const ctx = setup();
    dirs.push(ctx.home, ctx.repo);
    assert.equal(run(ctx, ["set", "runtime", "herdr"]).status, 0);
    assert.equal(run(ctx, ["set", "spec_author", "executor", "cursor"]).status, 0);
    assert.equal(run(ctx, ["set", "spec_author", "model", "grok-4.6"]).status, 0);
    assert.equal(run(ctx, ["set", "spec_author", "mode", "plan"]).status, 0);
    assert.equal(
      run(ctx, ["set", "spec_author", "capabilities.writeCode", "false"]).status,
      0
    );
    const home = homeCfg(ctx);
    assert.equal(home.runtime, "herdr");
    assert.equal(home.agents.spec_author.executor, "cursor");
    assert.equal(home.agents.spec_author.model, "grok-4.6");
    assert.equal(repoCfg(ctx).verifyCmd, "npm test");
    assert.ok(!repoCfg(ctx).runtime);
    assert.ok(!repoCfg(ctx).agents);
    const got = JSON.parse(run(ctx, ["get"]).stdout);
    assert.equal(got.verifyCmd, "npm test");
    assert.equal(got.agents.spec_author.executor, "cursor");
  });

  it("set orchestration fallbackOrder and quota on home", () => {
    const ctx = setup();
    dirs.push(ctx.home, ctx.repo);
    assert.equal(run(ctx, ["set", "orchestration", "maxReviewCycles", "2"]).status, 0);
    assert.equal(
      run(ctx, ["set", "orchestration", "fallbackOrder", "cursor,codex,claude"]).status,
      0
    );
    assert.equal(run(ctx, ["set", "quota", "sessionPct", "88"]).status, 0);
    const home = homeCfg(ctx);
    assert.equal(home.orchestration.maxReviewCycles, 2);
    assert.deepEqual(home.orchestration.fallbackOrder, ["cursor", "codex", "claude"]);
    assert.equal(home.quota.sessionPct, 88);
    const listed = run(ctx, ["list"]);
    assert.match(listed.stdout, /fallbackOrder: cursor, codex, claude/);
  });

  it("rejects invalid runtime and executor", () => {
    const ctx = setup();
    dirs.push(ctx.home, ctx.repo);
    const badRt = run(ctx, ["set", "runtime", "hod"]);
    assert.notEqual(badRt.status, 0);
    const badEx = run(ctx, ["set", "implementer", "executor", "grok"]);
    assert.notEqual(badEx.status, 0);
    assert.equal(homeCfg(ctx), null);
  });

  it("couples coordinator and implementer executors; sets effort", () => {
    const ctx = setup();
    dirs.push(ctx.home, ctx.repo);
    assert.equal(run(ctx, ["set", "implementer", "executor", "codex"]).status, 0);
    assert.equal(run(ctx, ["set", "implementer", "effort", "high"]).status, 0);
    assert.equal(run(ctx, ["set", "coordinator", "effort", "medium"]).status, 0);
    assert.equal(run(ctx, ["set", "model", "gpt-5.6-terra", "effort", "high"]).status, 0);
    const home = homeCfg(ctx);
    assert.equal(home.agents.implementer.executor, "codex");
    assert.equal(home.agents.coordinator.executor, "codex");
    assert.equal(home.agents.implementer.effort, "high");
    assert.equal(home.agents.coordinator.effort, "medium");
    assert.equal(home.models["gpt-5.6-terra"].effort, "high");
    assert.equal(run(ctx, ["set", "coordinator", "executor", "cursor"]).status, 0);
    assert.equal(homeCfg(ctx).agents.implementer.executor, "cursor");
    assert.equal(run(ctx, ["set", "implementer", "executor", "opencode"]).status, 0);
    assert.equal(homeCfg(ctx).agents.coordinator.executor, "opencode");
  });

  it("--feature / --task do not change the global default", () => {
    const ctx = setup();
    dirs.push(ctx.home, ctx.repo);
    assert.equal(run(ctx, ["set", "implementer", "executor", "claude"]).status, 0);
    assert.equal(
      run(ctx, ["set", "--task", "PROJ-123", "implementer", "executor", "opencode"]).status,
      0
    );
    assert.equal(
      run(ctx, ["set", "--feature", "feature-01", "reviewer", "executor", "cursor"]).status,
      0
    );
    assert.equal(homeCfg(ctx).agents.implementer.executor, "claude");
    assert.equal(homeCfg(ctx).tasks["PROJ-123"].agents.implementer.executor, "opencode");
    assert.equal(homeCfg(ctx).features["feature-01"].agents.reviewer.executor, "cursor");
    const listedTask = run(ctx, ["list", "--task", "PROJ-123"]);
    assert.match(listedTask.stdout, /escopo: tarefa PROJ-123/);
    assert.match(listedTask.stdout, /implementer\s+opencode/);
    const listedFeat = run(ctx, ["list", "--feature", "feature-01"]);
    assert.match(listedFeat.stdout, /escopo: feature feature-01/);
    assert.match(listedFeat.stdout, /reviewer\s+cursor/);
  });

  it("workspace layer beats home and list shows escopo", () => {
    const ctx = setup();
    dirs.push(ctx.home, ctx.repo);
    mkdirSync(join(ctx.home, "workspaces", "plat"), { recursive: true });
    writeFileSync(join(ctx.home, "current.json"), JSON.stringify({ name: "plat" }) + "\n");
    writeFileSync(
      join(ctx.home, "workspaces", "plat", "workspace.json"),
      JSON.stringify({ name: "plat", repos: [] }) + "\n"
    );
    assert.equal(run(ctx, ["set", "leader", "executor", "claude"]).status, 0);
    writeFileSync(
      join(ctx.home, "config.json"),
      JSON.stringify({ agents: { leader: { executor: "codex" } } }) + "\n"
    );
    assert.equal(run(ctx, ["set", "leader", "executor", "cursor"]).status, 0);
    const ws = JSON.parse(
      readFileSync(join(ctx.home, "workspaces", "plat", "config.json"), "utf8")
    );
    assert.equal(ws.agents.leader.executor, "cursor");
    assert.equal(homeCfg(ctx).agents.leader.executor, "codex");
    const listed = run(ctx, ["list"]);
    assert.match(listed.stdout, /escopo: workspace plat/);
    assert.match(listed.stdout, /leader\s+cursor/);
  });

  it("resolve: feature beats task, task beats geral", () => {
    const ctx = setup();
    dirs.push(ctx.home, ctx.repo);
    run(ctx, ["set", "implementer", "executor", "claude"]);
    run(ctx, ["set", "--task", "PROJ-123", "implementer", "executor", "codex"]);
    run(ctx, ["set", "--feature", "feature-01", "implementer", "executor", "cursor"]);
    const geral = JSON.parse(run(ctx, ["get"]).stdout);
    const task = JSON.parse(run(ctx, ["get", "--task", "PROJ-123"]).stdout);
    const feat = JSON.parse(
      run(ctx, ["get", "--task", "PROJ-123", "--feature", "feature-01"]).stdout
    );
    assert.equal(geral.agents.implementer.executor, "claude");
    assert.equal(task.agents.implementer.executor, "codex");
    assert.equal(feat.agents.implementer.executor, "cursor");
  });
});
