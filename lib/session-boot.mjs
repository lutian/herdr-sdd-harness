import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { workspaceDir } from "./home.mjs";
import { workspaceFeatureListPath } from "./workspace.mjs";

const OPEN = new Set(["pending", "spec_ready", "in_progress"]);

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function openFeatures(list) {
  return (list?.features || []).filter((f) => OPEN.has(f.status));
}

export function classifySession({ home, name, ws }) {
  const fl = readJson(workspaceFeatureListPath(name, home));
  const open = openFeatures(fl);
  const wsSession = readJson(join(workspaceDir(home, name), "session.json"));
  if (open.length || wsSession?.parentBranch) {
    return { kind: "resume", features: open, session: wsSession, list: fl };
  }
  for (const repo of ws?.repos || []) {
    const session = readJson(join(repo.path, ".sddharness", "session.json"));
    const repoList = readJson(join(repo.path, "sddharness", "feature_list.json"));
    const repoOpen = openFeatures(repoList);
    if (session?.parentBranch || repoOpen.length) {
      return { kind: "resume", features: repoOpen, session, list: repoList || fl };
    }
  }
  return { kind: "new", features: [], session: null, list: fl };
}

export function sessionBootPrompt(kind, { workspace, features } = {}) {
  if (kind === "resume") {
    const names = (features || []).map((f) => f.name).filter(Boolean);
    const next = names[0] || "a próxima feature";
    return [
      "Sessão pendente no workspace " + (workspace || "") + ".",
      "Retome o fluxo SDD: mostre o estado, a próxima onda e /sddharness usage.",
      names.length ? `Features abertas: ${names.join(", ")}.` : "",
      `Próximo passo: ${next}.`,
      "Não espere /sddharness init — continue a tarefa pendente.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    "Sessão nova no workspace " + (workspace || "") + ".",
    "Conduza o fluxo de nova tarefa (o que era /sddharness init):",
    "docs se faltarem, depois Jira (PROJ-123) ou descrição da tarefa.",
    "Não peça /sddharness init — você já está na sessão.",
  ].join(" ");
}
