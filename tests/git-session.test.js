import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it, after, before } from "node:test";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(KIT, "bin", "sddharness");
const SLUG = join(KIT, "template", "sddharness", "scripts", "git-slug.mjs");
const SESSION = join(KIT, "template", "sddharness", "scripts", "git-session.mjs");

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${r.stderr || r.stdout}`);
  }
  return (r.stdout || "").trim();
}

describe("git-slug", () => {
  it("slugifies accents and spaces", async () => {
    const { slugify, featureNn } = await import(pathToFileURL(SLUG).href);
    assert.equal(slugify("Atualização Serviço Payment"), "atualizacao-servico-payment");
    assert.equal(slugify("Implementando Adapters!!!"), "implementando-adapters");
    assert.equal(featureNn("feature-01"), "01");
    assert.equal(featureNn("feature-12"), "12");
  });
});

describe("git-session worktree flow", () => {
  let repo;

  before(() => {
    repo = mkdtempSync(join(tmpdir(), "sdd-git-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    // default branch main
    git(repo, ["checkout", "-b", "main"]);
    writeFileSync(join(repo, "README.md"), "# demo\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "init"]);
    mkdirSync(join(repo, "sddharness", "scripts"), { recursive: true });
    mkdirSync(join(repo, ".sddharness"), { recursive: true });
    cpSync(SLUG, join(repo, "sddharness", "scripts", "git-slug.mjs"));
    cpSync(SESSION, join(repo, "sddharness", "scripts", "git-session.mjs"));
  });

  after(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("ensure-parent creates mother branch from current", () => {
    const r = spawnSync(
      process.execPath,
      [
        join(repo, "sddharness", "scripts", "git-session.mjs"),
        "ensure-parent",
        "--jira",
        "JIRA-123",
        "--title",
        "Atualização Serviço Payment",
      ],
      { cwd: repo, encoding: "utf8" }
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /feature\/JIRA-123-atualizacao-servico-payment/);
    const branch = git(repo, ["branch", "--show-current"]);
    assert.equal(branch, "feature/JIRA-123-atualizacao-servico-payment");
    assert.ok(existsSync(join(repo, ".sddharness", "session.json")));
  });

  it("add-worktree + merge-worktree", () => {
    let r = spawnSync(
      process.execPath,
      [
        join(repo, "sddharness", "scripts", "git-session.mjs"),
        "add-worktree",
        "--jira",
        "JIRA-123",
        "--feature",
        "feature-01",
        "--title",
        "Implementando Adapters",
      ],
      { cwd: repo, encoding: "utf8" }
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const wt = join(repo, ".worktrees/JIRA-123-01-implementando-adapters");
    assert.ok(existsSync(wt));

    writeFileSync(join(wt, "adapters.txt"), "ok\n");
    git(wt, ["add", "adapters.txt"]);
    git(wt, ["commit", "-m", "feat: adapters"]);

    r = spawnSync(
      process.execPath,
      [
        join(repo, "sddharness", "scripts", "git-session.mjs"),
        "merge-worktree",
        "--feature",
        "feature-01",
      ],
      { cwd: repo, encoding: "utf8" }
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(existsSync(join(repo, "adapters.txt")));
    assert.ok(!existsSync(wt));
    const session = JSON.parse(
      readFileSync(join(repo, ".sddharness", "session.json"), "utf8")
    );
    assert.equal(session.features["feature-01"].merged, true);
  });
});

describe("git-session record-agent", () => {
  let repo;

  before(() => {
    repo = mkdtempSync(join(tmpdir(), "sdd-rec-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    git(repo, ["checkout", "-b", "main"]);
    writeFileSync(join(repo, "README.md"), "# demo\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "init"]);
    mkdirSync(join(repo, "sddharness", "scripts"), { recursive: true });
    mkdirSync(join(repo, ".sddharness"), { recursive: true });
    cpSync(SLUG, join(repo, "sddharness", "scripts", "git-slug.mjs"));
    cpSync(SESSION, join(repo, "sddharness", "scripts", "git-session.mjs"));
  });

  after(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("records pane without dropping worktreePath", () => {
    let r = spawnSync(
      process.execPath,
      [
        join(repo, "sddharness", "scripts", "git-session.mjs"),
        "ensure-parent",
        "--jira",
        "JIRA-1",
        "--title",
        "Login",
      ],
      { cwd: repo, encoding: "utf8" }
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = spawnSync(
      process.execPath,
      [
        join(repo, "sddharness", "scripts", "git-session.mjs"),
        "add-worktree",
        "--jira",
        "JIRA-1",
        "--feature",
        "feature-01",
        "--title",
        "Login",
      ],
      { cwd: repo, encoding: "utf8" }
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = spawnSync(
      process.execPath,
      [
        join(repo, "sddharness", "scripts", "git-session.mjs"),
        "record-agent",
        "--feature",
        "feature-01",
        "--role",
        "implementer",
        "--executor",
        "codex",
        "--pane",
        "w1:p2",
        "--model",
        "inherit",
        "--resolved",
        "cursor",
      ],
      { cwd: repo, encoding: "utf8" }
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const session = JSON.parse(
      readFileSync(join(repo, ".sddharness", "session.json"), "utf8")
    );
    const feat = session.features["feature-01"];
    assert.ok(feat.worktreePath);
    assert.equal(feat.merged, false);
    assert.equal(feat.agents.implementer.executor, "codex");
    assert.equal(feat.agents.implementer.executorResolved, "cursor");
    assert.equal(feat.agents.implementer.paneId, "w1:p2");
    assert.equal(feat.agents.implementer.model, "inherit");
  });
});

describe("install copies git scripts and gitignore", () => {
  const dest = mkdtempSync(join(tmpdir(), "sdd-inst-"));

  after(() => {
    rmSync(dest, { recursive: true, force: true });
  });

  it("copies git-session, git-slug, .gitignore with .worktrees", () => {
    const r = spawnSync(process.execPath, [CLI, "init", dest], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.ok(existsSync(join(dest, "sddharness", "scripts", "git-session.mjs")));
    assert.ok(existsSync(join(dest, "sddharness", "scripts", "git-slug.mjs")));
    assert.ok(existsSync(join(dest, "sddharness", "scripts", "import-task.mjs")));
    assert.ok(existsSync(join(dest, "sddharness", "feature_list.json")));
    assert.ok(!existsSync(join(dest, "feature_list.json")));
    assert.ok(!existsSync(join(dest, "scripts", "git-session.mjs")));
    const gi = readFileSync(join(dest, ".gitignore"), "utf8");
    assert.match(gi, /\.worktrees\//);
    const cmd = readFileSync(
      join(dest, ".cursor", "commands", "sddharness.md"),
      "utf8"
    );
    assert.match(cmd, /Criando a branch/);
    assert.match(cmd, /Criando o worktree/);
    assert.match(cmd, /Fazendo merge do worktree/);
    assert.match(cmd, /branch atual/);
    assert.match(cmd, /\/sddharness task/);
  });
});

describe("git-session --key alias", () => {
  let repo;

  before(() => {
    repo = mkdtempSync(join(tmpdir(), "sdd-key-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    git(repo, ["checkout", "-b", "main"]);
    writeFileSync(join(repo, "README.md"), "# demo\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "init"]);
    mkdirSync(join(repo, "sddharness", "scripts"), { recursive: true });
    mkdirSync(join(repo, ".sddharness"), { recursive: true });
    cpSync(SLUG, join(repo, "sddharness", "scripts", "git-slug.mjs"));
    cpSync(SESSION, join(repo, "sddharness", "scripts", "git-session.mjs"));
  });

  after(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("ensure-parent --key 1 creates feature/1-...", () => {
    const r = spawnSync(
      process.execPath,
      [
        join(repo, "sddharness", "scripts", "git-session.mjs"),
        "ensure-parent",
        "--key",
        "1",
        "--title",
        "Atualização Serviço Payment",
      ],
      { cwd: repo, encoding: "utf8" }
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /feature\/1-atualizacao-servico-payment/);
    const branch = git(repo, ["branch", "--show-current"]);
    assert.equal(branch, "feature/1-atualizacao-servico-payment");
  });
});
