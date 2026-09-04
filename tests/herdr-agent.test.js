import assert from "node:assert/strict";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT = join(KIT, "template", "sddharness", "scripts", "herdr-agent.mjs");
const FAKE = join(KIT, "tests", "fixtures", "fake-herdr.mjs");

function writeCfg(home, extra = {}) {
  mkdirSync(home, { recursive: true });
  writeFileSync(
    join(home, "config.json"),
    JSON.stringify(
      {
        runtime: "herdr",
        agents: {
          implementer: {
            executor: "codex",
            model: "inherit",
            mode: "agent",
            capabilities: { read: true, writeCode: true, writeSpec: false, execute: true },
          },
          spec_author: {
            executor: "cursor",
            model: "grok-4.6",
            mode: "plan",
            capabilities: { read: true, writeSpec: true, writeCode: false, execute: false },
          },
        },
        orchestration: { maxReviewCycles: 3 },
        quota: { sessionPct: 90, weeklyPct: 95 },
        ...extra,
      },
      null,
      2
    ) + "\n"
  );
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "sdd-herdr-"));
  const home = join(dir, "sdd-home");
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const herdrBin = join(bin, "herdr");
  cpSync(FAKE, herdrBin);
  chmodSync(herdrBin, 0o755);
  writeCfg(home);
  return {
    dir,
    home,
    bin,
    state: join(dir, "fake-state.json"),
    log: join(dir, "fake-log.txt"),
  };
}

function run(ctx, args, extraEnv = {}) {
  return spawnSync(process.execPath, [AGENT, ...args], {
    cwd: ctx.dir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${ctx.bin}:${process.env.PATH}`,
      HERDR_ENV: "1",
      HERDR_FAKE_STATE: ctx.state,
      HERDR_FAKE_LOG: ctx.log,
      SDDHARNESS_HOME: ctx.home,
      SDDHARNESS_FAKE_CLIS: "claude,codex,cursor,agent,opencode",
      SDDHARNESS_CLAUDE_SESSION_PCT: "10",
      SDDHARNESS_CODEX_SESSION_PCT: "10",
      SDDHARNESS_CURSOR_SESSION_PCT: "10",
      SDDHARNESS_OPENCODE_SESSION_PCT: "10",
      ...extraEnv,
    },
  });
}

describe("herdr-agent.mjs", () => {
  const dirs = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
  });

  it("fails without HERDR_ENV or when runtime is native", () => {
    const ctx = setup();
    dirs.push(ctx.dir);
    const noEnv = spawnSync(
      process.execPath,
      [AGENT, "spawn", "--role", "implementer", "--cwd", ctx.dir],
      {
        cwd: ctx.dir,
        encoding: "utf8",
        env: { ...process.env, PATH: `${ctx.bin}:${process.env.PATH}` },
      }
    );
    assert.notEqual(noEnv.status, 0);
    writeCfg(ctx.home, { runtime: "native" });
    const native = run(ctx, ["spawn", "--role", "implementer", "--cwd", ctx.dir]);
    assert.notEqual(native.status, 0);
    assert.match(native.stderr, /runtime não é herdr/);
  });

  it("spawn splits, starts and prints pane", () => {
    const ctx = setup();
    dirs.push(ctx.dir);
    const r = run(ctx, [
      "spawn",
      "--role",
      "implementer",
      "--cwd",
      ctx.dir,
      "--feature",
      "feature-01",
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.role, "implementer");
    assert.equal(json.name, "implementer-feature-01");
    assert.equal(json.executor, "codex");
    assert.match(json.paneId, /^w1:p/);
    const log = readFileSync(ctx.log, "utf8");
    assert.match(log, /pane split/);
    assert.match(log, /agent start implementer-feature-01 --kind codex/);
  });

  it("spawn two features uses distinct herdr names", () => {
    const ctx = setup();
    dirs.push(ctx.dir);
    const a = run(ctx, [
      "spawn",
      "--role",
      "implementer",
      "--cwd",
      ctx.dir,
      "--feature",
      "feature-01",
    ]);
    const b = run(ctx, [
      "spawn",
      "--role",
      "implementer",
      "--cwd",
      ctx.dir,
      "--feature",
      "feature-02",
    ]);
    assert.equal(a.status, 0, a.stderr);
    assert.equal(b.status, 0, b.stderr);
    assert.equal(JSON.parse(a.stdout).name, "implementer-feature-01");
    assert.equal(JSON.parse(b.stdout).name, "implementer-feature-02");
    const log = readFileSync(ctx.log, "utf8");
    assert.match(log, /agent start implementer-feature-01/);
    assert.match(log, /agent start implementer-feature-02/);
  });

  it("spawn reuses pane when the feature agent already exists", () => {
    const ctx = setup();
    dirs.push(ctx.dir);
    const first = run(ctx, [
      "spawn",
      "--role",
      "implementer",
      "--cwd",
      ctx.dir,
      "--feature",
      "feature-01",
    ]);
    assert.equal(first.status, 0, first.stderr);
    const pane = JSON.parse(first.stdout).paneId;
    const second = run(ctx, [
      "spawn",
      "--role",
      "implementer",
      "--cwd",
      ctx.dir,
      "--feature",
      "feature-01",
    ]);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).paneId, pane);
    const splits = readFileSync(ctx.log, "utf8").split("pane split").length - 1;
    assert.equal(splits, 1);
  });

  it("run reads canonical line after idle", () => {
    const ctx = setup();
    dirs.push(ctx.dir);
    const r = run(ctx, [
      "run",
      "--role",
      "implementer",
      "--cwd",
      ctx.dir,
      "--feature",
      "feature-01",
      "--prompt",
      "Implemente feature-01",
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /done -> sddharness\/progress\/impl_feature-01.md/);
  });

  it("blocked prompt exits 2 and never send-keys", () => {
    const ctx = setup();
    dirs.push(ctx.dir);
    const r = run(
      ctx,
      [
        "run",
        "--role",
        "implementer",
        "--cwd",
        ctx.dir,
        "--feature",
        "feature-01",
        "--prompt",
        "BLOCKED now",
      ],
      { HERDR_FAKE_BLOCKED: "1" }
    );
    assert.equal(r.status, 2, r.stderr + r.stdout);
    assert.match(r.stdout, /blocked ->/);
    const log = existsSync(ctx.log) ? readFileSync(ctx.log, "utf8") : "";
    assert.doesNotMatch(log, /send-keys/);
  });

  it("cursor start extras include model and mode", () => {
    const ctx = setup();
    dirs.push(ctx.dir);
    const r = run(ctx, [
      "spawn",
      "--role",
      "spec_author",
      "--cwd",
      ctx.dir,
      "--feature",
      "feature-01",
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const log = readFileSync(ctx.log, "utf8");
    assert.match(log, /agent start spec_author-feature-01 --kind cursor/);
    assert.match(log, /-- --model grok-4.6 --mode plan/);
  });

  it("exit 4 when configured is down and no fallbackOrder", () => {
    const ctx = setup();
    dirs.push(ctx.dir);
    const r = run(ctx, ["spawn", "--role", "implementer", "--cwd", ctx.dir], {
      SDDHARNESS_CODEX_SESSION_PCT: "91",
    });
    assert.equal(r.status, 4, r.stderr + r.stdout);
    assert.match(r.stderr, /executors disponíveis/);
  });

  it("exit 3 when every executor is down", () => {
    const ctx = setup();
    dirs.push(ctx.dir);
    const r = run(ctx, ["spawn", "--role", "implementer", "--cwd", ctx.dir], {
      SDDHARNESS_FAKE_CLIS: "",
      SDDHARNESS_CLAUDE_SESSION_PCT: undefined,
      SDDHARNESS_CODEX_SESSION_PCT: undefined,
      SDDHARNESS_CURSOR_SESSION_PCT: undefined,
      SDDHARNESS_OPENCODE_SESSION_PCT: undefined,
    });
    assert.equal(r.status, 3, r.stderr + r.stdout);
    assert.match(r.stderr, /nenhum executor disponível/);
  });
});
