import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { harnessHome, workspaceDir } from "./home.mjs";
import { acquireLock, findWorkspaceForCwd, readWorkspace } from "./workspace.mjs";
import { classifySession, sessionBootPrompt } from "./session-boot.mjs";

export function leaderStartArgs({ executor, model, effort } = {}) {
  const args = ["agent", "start", "leader", "--kind", executor || "claude"];
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
  { home = harnessHome(), lock = true, cwd = process.cwd() } = {}
) {
  const name = findWorkspaceForCwd(cwd, home);
  if (!name) throw new Error("nenhum workspace — sddharness workspace create <nome>");
  const ws = readWorkspace(name, home);
  if (!ws) throw new Error(`workspace não existe: ${name}`);
  if (lock) acquireLock(name, {}, home);
  const leader = cfg?.agents?.leader || {};
  const wsCwd = workspaceDir(home, name);
  const classified = classifySession({ home, name, ws });
  const session = classified.kind === "resume" ? "resume" : "new";
  const prompt = sessionBootPrompt(classified.kind, {
    workspace: name,
    features: classified.features,
  });
  const bootPromptPath = join(wsCwd, "boot-prompt.md");
  if (lock) writeFileSync(bootPromptPath, prompt + "\n");
  return {
    workspace: name,
    cwd: wsCwd,
    session,
    prompt,
    bootPromptPath,
    herdr: ["herdr"],
    leaderArgs: leaderStartArgs({
      executor: leader.executor || "claude",
      model: leader.model,
      effort: leader.effort,
    }),
    command: `herdr`,
    note: join(wsCwd, "workspace.json"),
  };
}
