#!/usr/bin/env node
/**
 * import-task.mjs — importa descrição livre (sem Jira) em feature_list.json
 *
 *   node sddharness/scripts/import-task.mjs next-id
 *   node sddharness/scripts/import-task.mjs import --description "..."
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const HARNESS = "sddharness";
const HISTORY_PATH = join(ROOT, HARNESS, "progress", "history.md");
const LIST_PATH = join(ROOT, HARNESS, "feature_list.json");
const CURRENT_PATH = join(ROOT, HARNESS, "progress", "current.md");
const TITLE_MAX = 80;

export function nextTaskId(historyText) {
  const text = String(historyText ?? "");
  let max = 0;
  const re = /(?:Tarefa\s+(\d+)|\*\*Id:\*\*\s+(\d+))/g;
  let match;
  while ((match = re.exec(text))) {
    const n = Number(match[1] || match[2]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export function titleFromDescription(description) {
  const raw = String(description ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!raw) return "tarefa";
  const first = raw.split("\n").find((line) => line.trim()) || raw;
  const line = first.trim();
  if (line.length <= TITLE_MAX) return line;
  return line.slice(0, TITLE_MAX).trim();
}

export function nextFeatureName(features) {
  let max = 0;
  for (const feature of features ?? []) {
    const match = String(feature.name || "").match(/^feature-(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `feature-${String(max + 1).padStart(2, "0")}`;
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fail(msg) {
  console.error(`[FAIL]  ${msg}`);
  process.exit(1);
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

function readHistory() {
  if (!existsSync(HISTORY_PATH)) return "";
  return readFileSync(HISTORY_PATH, "utf8");
}

function cmdNextId() {
  console.log(String(nextTaskId(readHistory())));
}

function appendHistory(history, id, title) {
  mkdirSync(dirname(HISTORY_PATH), { recursive: true });
  const prefix =
    history === "" || history.endsWith("\n") ? history : `${history}\n`;
  const block = `## ${today()} — Tarefa ${id}\n\n- **Origem:** manual\n- **Id:** ${id}\n- **Título:** ${title}\n`;
  writeFileSync(HISTORY_PATH, `${prefix}${block}`);
}

function updateCurrent({ id, name, title }) {
  mkdirSync(dirname(CURRENT_PATH), { recursive: true });
  const line = `Tarefa ${id} — ${title} (${name}, pending)`;
  if (!existsSync(CURRENT_PATH)) {
    writeFileSync(
      CURRENT_PATH,
      `# Sessão atual\n\n## Feature em andamento\n\n${line}\n`
    );
    return;
  }
  const current = readFileSync(CURRENT_PATH, "utf8");
  if (current.includes("Nenhuma.")) {
    writeFileSync(CURRENT_PATH, current.replace("Nenhuma.", line));
    return;
  }
  writeFileSync(CURRENT_PATH, `${current.trimEnd()}\n\n- ${line}\n`);
}

function cmdImport(description) {
  const text = String(description ?? "").trim();
  if (!text) fail('usage: import --description "..."');
  if (!existsSync(LIST_PATH)) fail("sddharness/feature_list.json ausente");

  let data;
  try {
    data = JSON.parse(readFileSync(LIST_PATH, "utf8"));
  } catch (err) {
    fail(`feature_list.json inválido: ${err.message}`);
  }

  const history = readHistory();
  const id = nextTaskId(history);
  const key = String(id);
  const title = titleFromDescription(text);
  const features = Array.isArray(data.features) ? data.features : [];
  const name = nextFeatureName(features);
  const featureId =
    features.reduce((max, f) => Math.max(max, Number(f.id) || 0), 0) + 1;

  const next = {
    ...data,
    description: title,
    source: { type: "manual", key },
    features: [
      ...features,
      {
        id: featureId,
        name,
        title,
        description: text,
        acceptance: [],
        sdd: true,
        status: "pending",
      },
    ],
  };

  writeFileSync(LIST_PATH, JSON.stringify(next, null, 2) + "\n");
  appendHistory(history, id, title);
  updateCurrent({ id, name, title });

  const validator = join(ROOT, HARNESS, "scripts", "validate-features.mjs");
  if (existsSync(validator)) {
    const r = spawnSync(process.execPath, [validator], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (r.status !== 0) {
      fail(`validate-features: ${(r.stdout || r.stderr || "").trim()}`);
    }
  }

  console.log(JSON.stringify({ id, key, title, parentTitle: title }, null, 2));
}

function usage() {
  console.log(`Usage:
  import-task.mjs next-id
  import-task.mjs import --description "..."`);
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  switch (cmd) {
    case "next-id":
      cmdNextId();
      break;
    case "import":
      cmdImport(args.description);
      break;
    default:
      usage();
      process.exit(cmd ? 1 : 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
