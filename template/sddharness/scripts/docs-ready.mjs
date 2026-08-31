#!/usr/bin/env node
// docs-ready.mjs — exit 0 se sddharness/docs/{architecture,conventions,verification}
// não contêm o marcador TODO do stub; exit 1 caso contrário.
// Rode a partir da raiz do projeto: node sddharness/scripts/docs-ready.mjs

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MARKER = "## TODO — preencha após instalar o arnês";
const FILES = [
  "sddharness/docs/architecture.md",
  "sddharness/docs/conventions.md",
  "sddharness/docs/verification.md",
];

const root = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : process.cwd();

let blocked = [];
for (const rel of FILES) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    blocked.push(`${rel} (ausente)`);
    continue;
  }
  const text = readFileSync(path, "utf8");
  if (text.includes(MARKER)) {
    blocked.push(rel);
  }
}

if (blocked.length > 0) {
  console.log(`[FAIL]  docs não prontos — ainda há stub TODO em:`);
  for (const b of blocked) console.log(`        - ${b}`);
  console.log(`[FAIL]  rode /sddharness filldocs ou preencha manualmente`);
  process.exit(1);
}

console.log("[OK]    sddharness/docs (architecture, conventions, verification) prontos");
process.exit(0);
