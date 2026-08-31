#!/usr/bin/env node
/**
 * Fake Herdr CLI for harness tests. State in HERDR_FAKE_STATE (JSON file).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const statePath = process.env.HERDR_FAKE_STATE;
const logPath = process.env.HERDR_FAKE_LOG;

function load() {
  if (!statePath || !existsSync(statePath)) {
    return { paneN: 1, agents: {}, lastPrompt: "", sendKeys: 0 };
  }
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function save(state) {
  if (statePath) writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

function log(line) {
  if (!logPath) return;
  const prev = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  writeFileSync(logPath, prev + line + "\n");
}

function out(obj) {
  console.log(JSON.stringify(obj));
}

const args = process.argv.slice(2);
log(args.join(" "));
const state = load();

if (args[0] === "pane" && args[1] === "split") {
  state.paneN += 1;
  const pane_id = `w1:p${state.paneN}`;
  save(state);
  out({ result: { pane: { pane_id } } });
  process.exit(0);
}

if (args[0] === "agent" && args[1] === "start") {
  const name = args[2];
  const kindIdx = args.indexOf("--kind");
  const paneIdx = args.indexOf("--pane");
  state.agents[name] = {
    kind: kindIdx >= 0 ? args[kindIdx + 1] : "claude",
    pane: paneIdx >= 0 ? args[paneIdx + 1] : "",
    status: "idle",
    extras: args.includes("--") ? args.slice(args.indexOf("--") + 1) : [],
  };
  save(state);
  out({ result: { agent: { name, status: "idle" } } });
  process.exit(0);
}

if (args[0] === "agent" && args[1] === "prompt") {
  const name = args[2];
  const prompt = args.slice(3).filter((a) => !a.startsWith("--")).join(" ");
  state.lastPrompt = prompt;
  const blocked =
    process.env.HERDR_FAKE_BLOCKED === "1" || /BLOCKED/.test(prompt);
  const status = blocked ? "blocked" : "idle";
  if (state.agents[name]) state.agents[name].status = status;
  save(state);
  if (blocked) {
    console.error(JSON.stringify({ error: "agent_blocked" }));
    process.exit(1);
  }
  out({ result: { agent: { name, status } } });
  process.exit(0);
}

if (args[0] === "agent" && args[1] === "wait") {
  const name = args[2];
  const status = state.agents[name]?.status || "idle";
  out({ result: { agent: { name, status } } });
  process.exit(0);
}

if (args[0] === "agent" && args[1] === "read") {
  const name = args[2];
  const status = state.agents[name]?.status || "idle";
  const text =
    status === "blocked"
      ? "Do you trust this directory?\nblocked -> sddharness/progress/impl_feature-01.md"
      : "done -> sddharness/progress/impl_feature-01.md";
  process.stdout.write(text + "\n");
  process.exit(0);
}

if (args[0] === "agent" && args[1] === "send-keys") {
  state.sendKeys = (state.sendKeys || 0) + 1;
  save(state);
  out({ result: { ok: true } });
  process.exit(0);
}

console.error("unknown fake-herdr command: " + args.join(" "));
process.exit(2);
