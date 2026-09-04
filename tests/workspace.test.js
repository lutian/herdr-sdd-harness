import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import {
  acquireLock,
  addRepo,
  createWorkspace,
  listWorkspaces,
  releaseLock,
  requireCurrent,
  useWorkspace,
} from "../lib/workspace.mjs";
import { assignRepo, canRunParallel, materializeRepoList, nextFeatureName } from "../lib/features.mjs";
import { executeStart, planStart } from "../lib/boot.mjs";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(KIT, "bin", "sddharness");

const homes = [];
afterEach(() => {
  while (homes.length) rmSync(homes.pop(), { recursive: true, force: true });
});

function home() {
  const dir = mkdtempSync(join(tmpdir(), "sdd-home-"));
  homes.push(dir);
  return dir;
}

describe("workspace CRUD + lock", () => {
  it("creates, lists, uses and locks", () => {
    const h = home();
    const { created } = createWorkspace("yooga", h);
    assert.equal(created, true);
    assert.deepEqual(listWorkspaces(h), ["yooga"]);
    const repo = mkdtempSync(join(tmpdir(), "sdd-repo-"));
    homes.push(repo);
    const ws = requireCurrent(h);
    const added = addRepo(ws, repo, { id: "api" }, h);
    assert.equal(added.repo.id, "api");
    acquireLock("yooga", { pid: 9, now: 1000 }, h);
    assert.throws(() => acquireLock("yooga", { pid: 10, now: 2000 }, h), /travado/);
    releaseLock("yooga", h);
    acquireLock("yooga", { pid: 10, now: 3000 }, h);
  });

  it("CLI workspace/repo + start --print", () => {
    const h = home();
    const repo = mkdtempSync(join(tmpdir(), "sdd-repo-"));
    homes.push(repo);
    mkdirSync(join(repo, ".git"));
    writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "api" }));
    const env = { ...process.env, SDDHARNESS_HOME: h };
    let r = spawnSync(process.execPath, [CLI, "workspace", "create", "plat"], {
      encoding: "utf8",
      env,
    });
    assert.equal(r.status, 0, r.stderr);
    r = spawnSync(process.execPath, [CLI, "repo", "add", repo], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = spawnSync(process.execPath, [CLI, "workspace", "list"], { encoding: "utf8", env });
    assert.match(r.stdout, /plat/);
    r = spawnSync(process.execPath, [CLI, "start", "--print"], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /herdr workspace create --cwd/);
    assert.match(r.stdout, /herdr agent start leader --kind claude --pane/);
    assert.match(r.stdout, /sessão nova/);
    r = spawnSync(process.execPath, [CLI, "usage"], {
      encoding: "utf8",
      env: {
        ...env,
        SDDHARNESS_FAKE_CLIS: "claude,codex,cursor,agent,opencode",
        SDDHARNESS_CLAUDE_SESSION_PCT: "82",
        SDDHARNESS_CLAUDE_WEEKLY_PCT: "61",
        SDDHARNESS_CODEX_SESSION_PCT: "10",
        SDDHARNESS_CURSOR_SESSION_PCT: "10",
        SDDHARNESS_OPENCODE_SESSION_PCT: "10",
      },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /claude/);
    assert.match(r.stdout, /sessão/);
    assert.match(r.stdout, /82%/);
    assert.match(r.stdout, /opencode/);
  });
});

describe("feature split", () => {
  it("asks when repo is ambiguous", () => {
    const repos = [
      { id: "api", path: "/x/api" },
      { id: "web", path: "/x/web" },
    ];
    const miss = assignRepo({
      text: "fazer login",
      repos,
      workspace: { jira: { components: { API: "api" } } },
    });
    assert.equal(miss.ambiguous, true);
    const hit = assignRepo({
      text: "api auth",
      repos,
      workspace: { jira: { components: {} } },
    });
    assert.equal(hit.repo, "api");
    const mapped = assignRepo({
      text: "x",
      component: "API",
      repos,
      workspace: { jira: { components: { API: "api" } } },
    });
    assert.equal(mapped.repo, "api");
  });

  it("parallel only same epic; materialize by repo", () => {
    assert.equal(canRunParallel([{ jira_key: "A" }, { jira_key: "A" }], "A"), true);
    assert.equal(canRunParallel([{ jira_key: "A" }, { jira_key: "B" }], "A"), false);
    assert.equal(nextFeatureName([{ name: "feature-02" }]), "feature-03");
    const list = materializeRepoList(
      {
        workspace: "p",
        features: [
          { name: "feature-01", repo: "api" },
          { name: "feature-02", repo: "web" },
        ],
      },
      "api"
    );
    assert.equal(list.features.length, 1);
    assert.equal(list.features[0].name, "feature-01");
  });
});

describe("start session", () => {
  it("start --print uses home leader.executor and classifies pendente", () => {
    const h = home();
    createWorkspace("plat", h);
    writeFileSync(
      join(h, "config.json"),
      JSON.stringify({
        runtime: "herdr",
        agents: { leader: { executor: "cursor", model: "inherit", effort: "medium" } },
      }) + "\n"
    );
    writeFileSync(
      join(h, "workspaces", "plat", "feature_list.json"),
      JSON.stringify({
        workspace: "plat",
        features: [
          {
            id: 1,
            name: "feature-01",
            title: "x",
            status: "pending",
          },
        ],
      }) + "\n"
    );
    const r = spawnSync(process.execPath, [CLI, "start", "--print"], {
      encoding: "utf8",
      env: { ...process.env, SDDHARNESS_HOME: h },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /herdr agent start leader --kind cursor --pane/);
    assert.match(r.stdout, /pendente/);
  });
});

describe("boot plan", () => {
  it("builds herdr leader args for codex", () => {
    const h = home();
    createWorkspace("w", h);
    useWorkspace("w", h);
    const plan = planStart(
      { agents: { leader: { executor: "codex", model: "gpt-5.6-sol", effort: "high" } } },
      { home: h, lock: false }
    );
    assert.deepEqual(plan.leaderArgs, [
      "agent",
      "start",
      "leader",
      "--kind",
      "codex",
      "--pane",
      "<root>",
      "--",
      "-m",
      "gpt-5.6-sol",
      "-c",
      "model_reasoning_effort=high",
    ]);
    assert.equal(plan.workspaceCreateArgs[0], "workspace");
    assert.equal(plan.workspaceCreateArgs[1], "create");
  });

  it("builds herdr leader args for opencode", () => {
    const h = home();
    createWorkspace("w2", h);
    useWorkspace("w2", h);
    const plan = planStart(
      { agents: { leader: { executor: "opencode", model: "openai/gpt-5", effort: "xhigh" } } },
      { home: h, lock: false }
    );
    assert.deepEqual(plan.leaderArgs, [
      "agent",
      "start",
      "leader",
      "--kind",
      "opencode",
      "--pane",
      "<root>",
      "--",
      "-m",
      "openai/gpt-5",
      "--variant",
      "max",
    ]);
  });

  it("executeStart creates pane then starts leader with --pane", () => {
    const h = home();
    createWorkspace("boot", h);
    const plan = planStart(
      { agents: { leader: { executor: "claude", effort: "medium" } } },
      { home: h, lock: false }
    );
    const calls = [];
    const run = (args) => {
      calls.push(args);
      if (args[0] === "workspace") {
        return {
          status: 0,
          stdout: JSON.stringify({ result: { root_pane: { pane_id: "w9:p1" } } }),
        };
      }
      return { status: 0, stdout: "{}" };
    };
    const status = executeStart(plan, {
      env: { ...process.env, HERDR_ENV: "1" },
      attach: false,
      ensure: () => true,
      run,
    });
    assert.equal(status, 0);
    assert.equal(calls[0][0], "workspace");
    assert.deepEqual(calls[1].slice(0, 7), [
      "agent",
      "start",
      "leader",
      "--kind",
      "claude",
      "--pane",
      "w9:p1",
    ]);
    assert.equal(calls[2][0], "agent");
    assert.equal(calls[2][1], "prompt");
  });
});
