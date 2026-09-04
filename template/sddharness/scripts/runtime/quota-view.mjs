export const DEFAULT_QUOTA = {
  sessionPct: 90,
  weeklyPct: 95,
  warnSessionPct: 70,
  warnWeeklyPct: 80,
};

export function classifyBand({ sessionPct, weeklyPct, reason } = {}, quota = {}) {
  const q = { ...DEFAULT_QUOTA, ...quota };
  if (reason === "disconnected") return "unknown";
  if (sessionPct == null && weeklyPct == null) return "unknown";
  if (sessionPct != null && sessionPct >= q.sessionPct) return "block";
  if (weeklyPct != null && weeklyPct >= q.weeklyPct) return "block";
  if (sessionPct != null && sessionPct >= q.warnSessionPct) return "warn";
  if (weeklyPct != null && weeklyPct >= q.warnWeeklyPct) return "warn";
  return "ok";
}

export function formatBar(pct, width = 20) {
  if (pct == null || !Number.isFinite(Number(pct))) return `${"░".repeat(width)}   ?%`;
  const n = Math.max(0, Math.min(100, Number(pct)));
  const filled = Math.round((n / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}  ${String(Math.round(n)).padStart(3)}%`;
}

export function formatUsage(rows) {
  const lines = [];
  for (const row of rows) {
    const roles = row.roles?.length ? `roles: ${row.roles.join(", ")}` : "";
    lines.push(`${row.executor.padEnd(8)} ${row.band.padEnd(8)} ${roles}`.trimEnd());
    lines.push(`  sessão  ${formatBar(row.sessionPct)}`);
    lines.push(`  ciclo   ${formatBar(row.weeklyPct)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function checkWave(probes, roleExecutors, quota = {}) {
  const byExec = {};
  for (const [role, executor] of Object.entries(roleExecutors || {})) {
    if (!byExec[executor]) byExec[executor] = [];
    byExec[executor].push(role);
  }
  const rows = [];
  let worst = "ok";
  const rank = { ok: 0, unknown: 1, warn: 2, block: 3 };
  for (const [executor, roles] of Object.entries(byExec)) {
    const probe = probes[executor] || {};
    const band = classifyBand(probe, quota);
    if (rank[band] > rank[worst]) worst = band;
    rows.push({
      executor,
      roles,
      band,
      sessionPct: probe.sessionPct,
      weeklyPct: probe.weeklyPct,
    });
  }
  return { worst, rows, autoSwitch: false };
}

export function suggestExecutors(probes, quota, fallbackOrder = []) {
  const order = fallbackOrder.length ? fallbackOrder : ["claude", "codex", "cursor", "opencode"];
  return order.filter((name) => {
    const band = classifyBand(probes[name] || {}, quota);
    return band === "ok" || band === "warn";
  });
}
