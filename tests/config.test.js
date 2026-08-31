import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it, afterEach } from "node:test";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_SRC = join(KIT, "template", "sddharness", "scripts", "config.mjs");

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "sdd-cfg-"));
  mkdirSync(join(dir, "sddharness", "scripts"), { recursive: true });
  mkdirSync(join(dir, ".sddharness"), { recursive: true });
  cpSync(CONFIG_SRC, join(dir, "sddharness", "scripts", "config.mjs"));
  writeFileSync(
    join(dir, ".sddharness", "config.json"),
    JSON.stringify(
      {
        runtime: "native",
        verifyCmd: "npm test",
        agents: {
          leader: { executor: "claude", model: "inherit" },
          spec_author: { executor: "claude", model: "inherit", mode: "plan" },
          implementer: { executor: "claude", model: "inherit" },
          reviewer: { executor: "claude", model: "inherit" },
          docs_filler: { executor: "claude", model: "inherit" },
          jira_importer: { executor: "claude", model: "inherit" },
        },
        orchestration: { maxReviewCycles: 3 },
        quota: { sessionPct: 90, weeklyPct: 95 },
      },
      null,
      2
    ) + "\n"
  );
  return dir;
}

function run(dir, args) {
  return spawnSync(
    process.execPath,
    [join(dir, "sddharness", "scripts", "config.mjs"), ...args],
    { cwd: dir, encoding: "utf8" }
  );
}

function readCfg(dir) {
  return JSON.parse(readFileSync(join(dir, ".sddharness", "config.json"), "utf8"));
}

describe("config.mjs", () => {
  const dirs = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
  });

  it("get prints JSON with runtime native by default", () => {
    const dir = setup();
    dirs.push(dir);
    const r = run(dir, ["get"]);
    assert.equal(r.status, 0, r.stderr);
    const cfg = JSON.parse(r.stdout);
    assert.equal(cfg.runtime, "native");
    assert.equal(cfg.orchestration.maxReviewCycles, 3);
    assert.ok(!cfg.orchestration.fallbackOrder);
  });

  it("list shows executors, models and maxReviewCycles", () => {
    const dir = setup();
    dirs.push(dir);
    const r = run(dir, ["list"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /runtime: native/);
    assert.match(r.stdout, /maxReviewCycles: 3/);
    assert.match(r.stdout, /fallbackOrder: \(não definido/);
    assert.match(r.stdout, /spec_author\s+claude\s+inherit\s+plan/);
    assert.match(r.stdout, /implementer\s+claude\s+inherit/);
  });

  it("set runtime and agent fields without dropping verifyCmd", () => {
    const dir = setup();
    dirs.push(dir);
    assert.equal(run(dir, ["set", "runtime", "herdr"]).status, 0);
    assert.equal(run(dir, ["set", "spec_author", "executor", "cursor"]).status, 0);
    assert.equal(run(dir, ["set", "spec_author", "model", "grok-4.6"]).status, 0);
    assert.equal(run(dir, ["set", "spec_author", "mode", "plan"]).status, 0);
    assert.equal(
      run(dir, ["set", "spec_author", "capabilities.writeCode", "false"]).status,
      0
    );
    const cfg = readCfg(dir);
    assert.equal(cfg.runtime, "herdr");
    assert.equal(cfg.verifyCmd, "npm test");
    assert.equal(cfg.agents.spec_author.executor, "cursor");
    assert.equal(cfg.agents.spec_author.model, "grok-4.6");
    assert.equal(cfg.agents.spec_author.mode, "plan");
    assert.equal(cfg.agents.spec_author.capabilities.writeCode, false);
  });

  it("set orchestration fallbackOrder and quota", () => {
    const dir = setup();
    dirs.push(dir);
    assert.equal(
      run(dir, ["set", "orchestration", "maxReviewCycles", "2"]).status,
      0
    );
    assert.equal(
      run(dir, ["set", "orchestration", "fallbackOrder", "cursor,codex,claude"])
        .status,
      0
    );
    assert.equal(run(dir, ["set", "quota", "sessionPct", "88"]).status, 0);
    const cfg = readCfg(dir);
    assert.equal(cfg.orchestration.maxReviewCycles, 2);
    assert.deepEqual(cfg.orchestration.fallbackOrder, [
      "cursor",
      "codex",
      "claude",
    ]);
    assert.equal(cfg.quota.sessionPct, 88);
    const listed = run(dir, ["list"]);
    assert.match(listed.stdout, /fallbackOrder: cursor, codex, claude/);
  });

  it("rejects invalid runtime and executor", () => {
    const dir = setup();
    dirs.push(dir);
    const badRt = run(dir, ["set", "runtime", "hod"]);
    assert.notEqual(badRt.status, 0);
    const badEx = run(dir, ["set", "implementer", "executor", "grok"]);
    assert.notEqual(badEx.status, 0);
    assert.equal(readCfg(dir).runtime, "native");
  });
});
