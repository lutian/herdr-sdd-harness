#!/usr/bin/env node
/**
 * git-session.mjs — branch mãe + worktree por feature
 *
 *   node sddharness/scripts/git-session.mjs current-branch
 *   node sddharness/scripts/git-session.mjs ensure-parent --jira KEY|--key KEY --title "..."
 *   node sddharness/scripts/git-session.mjs add-worktree --jira KEY|--key KEY --feature feature-01 --title "..."
 *   node sddharness/scripts/git-session.mjs merge-worktree --feature feature-01
 *   node sddharness/scripts/git-session.mjs show-session
 *   node sddharness/scripts/git-session.mjs record-agent --feature feature-01 --role implementer --executor codex --pane w1:p2
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { featureNn, slugify } from "./git-slug.mjs";

let ROOT = process.cwd();

function sessionRoot(args = {}) {
  const raw = args.root || process.env.SDDHARNESS_REPO_ROOT || process.cwd();
  return resolve(raw);
}

function sessionPath(root = ROOT) {
  return join(root, ".sddharness", "session.json");
}

function fail(msg) {
  console.error(`[FAIL]  ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[OK]    ${msg}`);
}

function git(args, opts = {}) {
  const r = spawnSync("git", args, {
    cwd: opts.cwd || ROOT,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    fail(`git ${args.join(" ")}: ${err || `exit ${r.status}`}`);
  }
  return (r.stdout || "").trim();
}

function gitOk(args, opts = {}) {
  const r = spawnSync("git", args, {
    cwd: opts.cwd || ROOT,
    encoding: "utf8",
  });
  return r.status === 0;
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

function readSession(root) {
  const path = sessionPath(root);
  if (!existsSync(path)) {
    return {
      jiraKey: null,
      baseBranch: null,
      parentBranch: null,
      parentTitle: null,
      features: {},
    };
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeSession(session, root = ROOT) {
  mkdirSync(join(root, ".sddharness"), { recursive: true });
  writeFileSync(sessionPath(root), JSON.stringify(session, null, 2) + "\n");
}

function withMergeLock(fn) {
  const lock = join(ROOT, ".sddharness", "merge.lock");
  mkdirSync(join(ROOT, ".sddharness"), { recursive: true });
  if (existsSync(lock)) fail(`merge em andamento neste repo (${lock})`);
  writeFileSync(lock, String(process.pid));
  try {
    return fn();
  } finally {
    if (existsSync(lock)) rmSync(lock);
  }
}

function branchExists(name) {
  return gitOk(["show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
}

function cmdCurrentBranch() {
  if (!gitOk(["rev-parse", "--is-inside-work-tree"])) {
    fail("não é um repositório git");
  }
  const name = git(["branch", "--show-current"]);
  if (!name) fail("HEAD detached — faça checkout de uma branch antes");
  console.log(name);
}

function sessionKey(args) {
  const key = args.key || args.jira;
  if (!key || key === true) return null;
  return String(key);
}

function cmdEnsureParent(args) {
  const jira = sessionKey(args);
  const title = args.title;
  if (!jira || !title || title === true) {
    fail('usage: ensure-parent --jira KEY|--key KEY --title "..."');
  }

  const base = git(["branch", "--show-current"]);
  if (!base) fail("HEAD detached — faça checkout de uma branch base");

  const slug = slugify(title);
  const parentBranch = `feature/${jira}-${slug}`;

  if (branchExists(parentBranch)) {
    git(["checkout", parentBranch]);
    ok(`branch mãe já existia: ${parentBranch}`);
  } else {
    git(["checkout", "-b", parentBranch]);
    ok(`branch mãe criada: ${parentBranch}`);
  }

  const session = readSession(ROOT);
  session.jiraKey = jira;
  session.baseBranch = base;
  session.parentBranch = parentBranch;
  session.parentTitle = title;
  session.features = session.features || {};
  writeSession(session, ROOT);

  console.log(parentBranch);
}

function cmdAddWorktree(args) {
  const jira = sessionKey(args);
  const feature = args.feature;
  const title = args.title;
  if (!jira || !feature || !title || feature === true || title === true) {
    fail(
      'usage: add-worktree --jira KEY|--key KEY --feature feature-01 --title "..."'
    );
  }

  const session = readSession(ROOT);
  const parentBranch = session.parentBranch;
  if (!parentBranch) fail("rode ensure-parent antes de add-worktree");

  const nn = featureNn(feature);
  const slug = slugify(title);
  const worktreeBranch = `feature/${jira}-${nn}-${slug}`;
  const worktreePath = `.worktrees/${jira}-${nn}-${slug}`;
  const absPath = join(ROOT, worktreePath);

  mkdirSync(join(ROOT, ".worktrees"), { recursive: true });

  if (existsSync(absPath)) {
    ok(`worktree já existe: ${worktreePath}`);
  } else if (branchExists(worktreeBranch)) {
    git(["worktree", "add", worktreePath, worktreeBranch]);
    ok(`worktree anexado à branch existente: ${worktreeBranch}`);
  } else {
    git(["worktree", "add", "-b", worktreeBranch, worktreePath, parentBranch]);
    ok(`worktree criado: ${worktreeBranch} → ${worktreePath}`);
  }

  session.jiraKey = jira;
  session.features = session.features || {};
  session.features[feature] = {
    worktreeBranch,
    worktreePath,
    title,
    merged: false,
  };
  writeSession(session, ROOT);

  console.log(
    JSON.stringify({ worktreeBranch, worktreePath, parentBranch }, null, 2)
  );
}

function cmdMergeWorktree(args) {
  const feature = args.feature;
  if (!feature) fail("usage: merge-worktree --feature feature-01 [--root <abs>]");

  withMergeLock(() => mergeWorktreeUnlocked(feature));
}

function mergeWorktreeUnlocked(feature) {
  const session = readSession(ROOT);
  const parentBranch = session.parentBranch;
  const feat = session.features?.[feature];
  if (!parentBranch) fail("session sem parentBranch");
  if (!feat) fail(`feature ${feature} não está na session`);

  const { worktreeBranch, worktreePath } = feat;
  const absPath = join(ROOT, worktreePath);

  // dirty check no worktree
  if (existsSync(absPath)) {
    const dirty = git(["status", "--porcelain"], { cwd: absPath });
    if (dirty) {
      fail(
        `worktree sujo em ${worktreePath}. Faça commit (ou stash) antes do merge:\n${dirty}`
      );
    }
  }

  git(["checkout", parentBranch]);
  git(["merge", "--no-ff", worktreeBranch, "-m", `merge ${worktreeBranch} into ${parentBranch}`]);
  ok(`merge de ${worktreeBranch} → ${parentBranch}`);

  if (existsSync(absPath)) {
    git(["worktree", "remove", "--force", worktreePath]);
    ok(`worktree removido: ${worktreePath}`);
  }

  // remove branch do worktree se ainda existir e não for a mãe
  if (branchExists(worktreeBranch) && worktreeBranch !== parentBranch) {
    git(["branch", "-d", worktreeBranch]);
    ok(`branch do worktree removida: ${worktreeBranch}`);
  }

  feat.merged = true;
  writeSession(session, ROOT);
  console.log(JSON.stringify({ parentBranch, worktreeBranch, merged: true }, null, 2));
}

function cmdShowSession() {
  const path = sessionPath(ROOT);
  if (!existsSync(path)) {
    console.log("{}");
    return;
  }
  console.log(readFileSync(path, "utf8").trimEnd());
}

function cmdRecordAgent(args) {
  const feature = args.feature;
  const role = args.role;
  const executor = args.executor;
  const pane = args.pane;
  if (!feature || !role || !executor || !pane) {
    fail(
      "usage: record-agent --feature feature-01 --role implementer --executor codex --pane w1:p2 [--model inherit] [--session-id ID] [--resolved [executor]]"
    );
  }

  const session = readSession(ROOT);
  const feat = session.features?.[feature];
  if (!feat) fail(`feature ${feature} não está na session`);

  const prev = feat.agents?.[role] || {};
  const agent = {
    ...prev,
    executor,
    paneId: pane,
  };
  if (args.model && args.model !== true) agent.model = args.model;
  if (args["session-id"] && args["session-id"] !== true) {
    agent.sessionId = args["session-id"];
  }
  if (args.resolved) {
    agent.executorResolved = args.resolved === true ? executor : args.resolved;
  }

  session.features = {
    ...session.features,
    [feature]: {
      ...feat,
      agents: { ...(feat.agents || {}), [role]: agent },
    },
  };
  writeSession(session, ROOT);
  console.log(JSON.stringify(agent, null, 2));
}

function usage() {
  console.log(`Usage:
  git-session.mjs current-branch [--root <abs>]
  git-session.mjs ensure-parent --jira KEY|--key KEY --title "..."
  git-session.mjs add-worktree --jira KEY|--key KEY --feature feature-01 --title "..."
  git-session.mjs merge-worktree --feature feature-01
  git-session.mjs show-session
  git-session.mjs record-agent --feature feature-01 --role implementer --executor codex --pane w1:p2`);
}

const argv = parseArgs(process.argv.slice(2));
ROOT = sessionRoot(argv);
const cmd = argv._[0];

switch (cmd) {
  case "current-branch":
    cmdCurrentBranch();
    break;
  case "ensure-parent":
    cmdEnsureParent(argv);
    break;
  case "add-worktree":
    cmdAddWorktree(argv);
    break;
  case "merge-worktree":
    cmdMergeWorktree(argv);
    break;
  case "show-session":
    cmdShowSession();
    break;
  case "record-agent":
    cmdRecordAgent(argv);
    break;
  default:
    usage();
    process.exit(cmd ? 1 : 1);
}
