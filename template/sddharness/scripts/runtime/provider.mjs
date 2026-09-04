import { spawnSync } from "node:child_process";

export const EXECUTORS = ["claude", "codex", "cursor", "opencode"];

export function usedPercent({ used, remaining } = {}) {
  if (used != null && Number.isFinite(Number(used))) return Number(used);
  if (remaining != null && Number.isFinite(Number(remaining))) {
    return 100 - Number(remaining);
  }
  return undefined;
}

export function commandExists(name) {
  const r = spawnSync("sh", ["-c", `command -v ${JSON.stringify(name)}`], {
    encoding: "utf8",
  });
  return r.status === 0;
}

export function envPct(env, prefix, suffix) {
  const raw = env[`SDDHARNESS_${prefix}_${suffix}`];
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function decideQuota({ sessionPct, weeklyPct }, quota = {}) {
  const sessionLimit = quota.sessionPct ?? 90;
  const weeklyLimit = quota.weeklyPct ?? 95;
  if (sessionPct != null && sessionPct >= sessionLimit) {
    return { ok: false, reason: "quota", sessionPct, weeklyPct };
  }
  if (weeklyPct != null && weeklyPct >= weeklyLimit) {
    return { ok: false, reason: "quota", sessionPct, weeklyPct };
  }
  return { ok: true, reason: "ok", sessionPct, weeklyPct };
}

export function capList(capabilities = {}) {
  return ["read", "writeSpec", "writeCode", "execute"]
    .filter((k) => capabilities[k])
    .join(",") || "-";
}

export class AgentProvider {
  constructor({ which = commandExists } = {}) {
    this.which = which;
  }

  get kind() {
    throw new Error("kind");
  }

  get envPrefix() {
    return this.kind.toUpperCase();
  }

  get cliNames() {
    return [this.kind];
  }

  modelFlag(model) {
    return ["--model", model];
  }

  buildStartArgs({ model, mode, effort } = {}) {
    const args = [];
    if (model && model !== "inherit") args.push(...this.modelFlag(model));
    if (mode && this.kind === "cursor" && mode !== "agent") {
      args.push("--mode", mode);
    }
    if (effort && effort !== "inherit") {
      if (this.kind === "claude") args.push("--effort", effort === "max" ? "xhigh" : effort);
      if (this.kind === "codex") args.push("-c", `model_reasoning_effort=${effort}`);
      if (this.kind === "opencode") args.push("--variant", effort === "xhigh" ? "max" : effort);
    }
    return args;
  }

  buildPromptPreamble({ role, harnessRoot, worktree, capabilities, effort } = {}) {
    const wt = worktree || "";
    const lines = [
      `Você é o ${role} do SDD Harness.`,
      `HARNESS_ROOT=${harnessRoot}`,
      `WORKTREE=${wt}`,
      `capabilities: ${capList(capabilities)}`,
      "Leia/escreva artefatos SDD só em $HARNESS_ROOT/sddharness/",
      "Edite código só em $WORKTREE e só se capabilities.writeCode",
      `Contrato: $HARNESS_ROOT/.claude/agents/${role}.md (ou .cursor/agents/${role}.md)`,
    ];
    if (effort && this.kind === "cursor") lines.push(`Esforço preferido: ${effort}`);
    return lines.join("\n");
  }

  cliPresent() {
    if (process.env.SDDHARNESS_FAKE_CLIS != null) {
      const set = new Set(
        process.env.SDDHARNESS_FAKE_CLIS.split(",").map((s) => s.trim()).filter(Boolean)
      );
      return this.cliNames.some((name) => set.has(name) || set.has(this.kind));
    }
    return this.cliNames.some((name) => this.which(name));
  }

  async readLiveQuota() {
    return {};
  }

  async probe({ quota, env = process.env } = {}) {
    if (!this.cliPresent()) return { ok: false, reason: "disconnected" };
    const sessionPct = envPct(env, this.envPrefix, "SESSION_PCT");
    const weeklyPct = envPct(env, this.envPrefix, "WEEKLY_PCT");
    const live =
      sessionPct == null && weeklyPct == null
        ? await this.readLiveQuota()
        : { sessionPct, weeklyPct };
    if (live.sessionPct == null && live.weeklyPct == null) {
      return { ok: true, reason: "unknown" };
    }
    return decideQuota(live, quota);
  }
}
