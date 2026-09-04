export const CANONICAL_EFFORTS = ["inherit", "low", "medium", "high", "xhigh"];
export const RAW_EFFORTS = ["none", "minimal", "max", "ultra"];
export const ALL_EFFORTS = [...CANONICAL_EFFORTS, ...RAW_EFFORTS];

export const ROLE_EFFORT_DEFAULT = {
  leader: "medium",
  docs_filler: "low",
  jira_importer: "low",
  spec_author: "medium",
  coordinator: "high",
  implementer: "high",
  reviewer: "low",
};

export function isEffort(value) {
  return ALL_EFFORTS.includes(String(value));
}

export function resolveEffort({ role, agent = {}, models = {} } = {}) {
  const roleEffort = agent.effort;
  if (roleEffort && roleEffort !== "inherit") return roleEffort;
  const slug = agent.model && agent.model !== "inherit" ? agent.model : null;
  if (slug && models[slug]?.effort && models[slug].effort !== "inherit") {
    return models[slug].effort;
  }
  return ROLE_EFFORT_DEFAULT[role] || "medium";
}

export function effortStartArgs(executor, effort) {
  if (!effort || effort === "inherit") return [];
  if (executor === "claude") return ["--effort", effort === "max" ? "xhigh" : effort];
  if (executor === "codex") return ["-c", `model_reasoning_effort=${effort}`];
  if (executor === "opencode") return ["--variant", effort === "xhigh" ? "max" : effort];
  return [];
}

export function effortPreamble(executor, effort) {
  if (!effort || effort === "inherit") return "";
  if (executor === "cursor") return `Esforço preferido: ${effort}`;
  return "";
}
