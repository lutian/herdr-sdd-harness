import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { harnessHome, workspaceDir } from "./home.mjs";
import { findWorkspaceForCwd, pickLeaderCwd, readWorkspace } from "./workspace.mjs";
import { classifySession, sessionBootPrompt } from "./session-boot.mjs";
import { ensureHerdrServer, herdrSync, parseHerdrJson, rootPaneId } from "./herdr-cli.mjs";

export function leaderStartArgs({ executor, model, effort, pane } = {}) {
  const args = [
    "agent",
    "start",
    "leader",
    "--kind",
    executor || "claude",
    "--pane",
    pane || "<root>",
  ];
  const extra = [];
  if (model && model !== "inherit") {
    extra.push(executor === "codex" || executor === "opencode" ? "-m" : "--model", model);
  }
  if (effort && effort !== "inherit") {
    if (executor === "claude") extra.push("--effort", effort);
    if (executor === "codex") extra.push("-c", `model_reasoning_effort=${effort}`);
    if (executor === "opencode") extra.push("--variant", effort === "xhigh" ? "max" : effort);
  }
  if (extra.length) args.push("--", ...extra);
  return args;
}

export function planStart(
  cfg,
  { home = harnessHome(), cwd = process.cwd() } = {}
) {
  const name = findWorkspaceForCwd(cwd, home);
  if (!name) throw new Error("nenhum workspace — npm exec sddharness workspace create <nome>");
  const ws = readWorkspace(name, home);
  if (!ws) throw new Error(`workspace não existe: ${name}`);
  const leader = cfg?.agents?.leader || {};
  const metaDir = workspaceDir(home, name);
  const leaderCwd = pickLeaderCwd(ws, cwd);
  if (!leaderCwd) {
    throw new Error("nenhum repo no workspace — node bin/sddharness repo add <path>");
  }
  const classified = classifySession({ home, name, ws });
  const session = classified.kind === "resume" ? "resume" : "new";
  const prompt = sessionBootPrompt(classified.kind, {
    workspace: name,
    features: classified.features,
  });
  const bootPromptPath = join(metaDir, "boot-prompt.md");
  writeFileSync(bootPromptPath, prompt + "\n");
  const leaderOpts = {
    executor: leader.executor || "claude",
    model: leader.model,
    effort: leader.effort,
    pane: "<root>",
  };
  return {
    workspace: name,
    cwd: leaderCwd,
    session,
    prompt,
    bootPromptPath,
    herdr: ["herdr"],
    workspaceCreateArgs: [
      "workspace",
      "create",
      "--cwd",
      leaderCwd,
      "--label",
      `sdd-${name}`,
      "--focus",
      "--env",
      `SDDHARNESS_SESSION=${session}`,
      "--env",
      `SDDHARNESS_BOOT_PROMPT=${bootPromptPath}`,
    ],
    leaderOpts,
    leaderArgs: leaderStartArgs(leaderOpts),
    promptArgs: ["agent", "prompt", "leader", prompt],
    command: `herdr`,
    note: join(metaDir, "workspace.json"),
  };
}

export function formatStartPlan(plan) {
  const sessionWord = plan.session === "resume" ? "pendente" : "nova";
  return [
    `[OK]    workspace ${plan.workspace}`,
    `[OK]    cwd ${plan.cwd}`,
    `[OK]    sessão ${sessionWord}`,
    `herdr ${plan.workspaceCreateArgs.join(" ")}`,
    `herdr ${plan.leaderArgs.join(" ")}`,
    `herdr agent prompt leader …`,
    plan.prompt,
  ].join("\n");
}

export function executeStart(
  plan,
  { env = process.env, attach = true, run = herdrSync, ensure = ensureHerdrServer } = {}
) {
  if (!ensure({ env })) {
    throw new Error("herdr não está rodando — abra um terminal e rode: herdr");
  }
  const created = run(plan.workspaceCreateArgs, { cwd: plan.cwd, env });
  if (created.status !== 0) {
    throw new Error(
      `herdr workspace create falhou: ${(created.stderr || created.stdout || "").trim()}`
    );
  }
  const pane = rootPaneId(parseHerdrJson(created.stdout));
  if (!pane) throw new Error("herdr workspace create não devolveu pane_id");
  const startArgs = leaderStartArgs({ ...plan.leaderOpts, pane });
  const started = run(startArgs, { cwd: plan.cwd, env });
  if (started.status !== 0) {
    throw new Error(`herdr agent start falhou: ${(started.stderr || started.stdout || "").trim()}`);
  }
  run(["agent", "prompt", "leader", plan.prompt], { cwd: plan.cwd, env });
  if (attach && env.HERDR_ENV !== "1") {
    const r = spawnSync("herdr", [], { cwd: plan.cwd, stdio: "inherit", env });
    return r.status ?? 0;
  }
  return 0;
}
