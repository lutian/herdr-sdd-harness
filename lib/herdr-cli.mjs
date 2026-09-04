import { spawn, spawnSync } from "node:child_process";

export function parseHerdrJson(stdout) {
  const start = String(stdout || "").indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
}

export function herdrSync(args, { cwd, env = process.env } = {}) {
  return spawnSync("herdr", args, { cwd, encoding: "utf8", env });
}

export function herdrServerRunning(env = process.env) {
  const r = herdrSync(["status", "server"], { env });
  return r.status === 0 && /status:\s*running/i.test(r.stdout || "");
}

export function ensureHerdrServer({ env = process.env, waitMs = 8000 } = {}) {
  if (herdrServerRunning(env)) return true;
  const child = spawn("herdr", [], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (herdrServerRunning(env)) return true;
    spawnSync("sleep", ["0.2"]);
  }
  return herdrServerRunning(env);
}

export function rootPaneId(json) {
  return json?.result?.root_pane?.pane_id || json?.result?.pane?.pane_id || null;
}
