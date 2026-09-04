#!/usr/bin/env node
/**
 * quota.mjs — check (JSON) | usage (barras)
 */
import { checkWave, formatUsage, DEFAULT_QUOTA } from "./runtime/quota-view.mjs";
import { EXECUTORS } from "./runtime/provider.mjs";
import { readConfig } from "./config.mjs";
import { createProviders } from "./herdr-agent.mjs";

async function probesOf(cfg) {
  const providers = createProviders();
  const quota = { ...DEFAULT_QUOTA, ...(cfg.quota || {}) };
  const probes = {};
  for (const name of EXECUTORS) {
    probes[name] = await providers[name].probe({ quota, env: process.env });
  }
  return probes;
}

function roleMap(cfg) {
  const out = {};
  for (const [role, agent] of Object.entries(cfg.agents || {})) {
    out[role] = agent.executor || "claude";
  }
  return out;
}

async function main(argv) {
  const cmd = argv[0] || "usage";
  const cfg = readConfig();
  const probes = await probesOf(cfg);
  const roles = [];
  const idx = argv.indexOf("--roles");
  if (idx >= 0 && argv[idx + 1]) roles.push(...String(argv[idx + 1]).split(","));
  const map = roleMap(cfg);
  const filtered = roles.length
    ? Object.fromEntries(Object.entries(map).filter(([r]) => roles.includes(r)))
    : map;
  const result = checkWave(probes, filtered, cfg.quota);
  if (cmd === "check") {
    console.log(JSON.stringify({ ...result, autoSwitch: false }, null, 2));
    if (result.worst === "block") process.exit(2);
    if (result.worst === "warn") process.exit(1);
    return;
  }
  const rows = EXECUTORS.map((executor) => {
    const hit = result.rows.find((r) => r.executor === executor);
    const probe = probes[executor] || {};
    return {
      executor,
      band: hit?.band || (probe.reason === "disconnected" ? "unknown" : "ok"),
      roles: hit?.roles || [],
      sessionPct: probe.sessionPct,
      weeklyPct: probe.weeklyPct,
    };
  });
  process.stdout.write(formatUsage(rows));
}

if (process.argv[1] && process.argv[1].endsWith("quota.mjs")) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`[FAIL]  ${err.message}`);
    process.exit(1);
  });
}
