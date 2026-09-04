import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = join(ROOT, "template", "sddharness", "scripts", "runtime");

async function load(rel) {
  return import(pathToFileURL(join(RUNTIME, rel)).href);
}

describe("providers", () => {
  it("buildStartArgs maps model and cursor mode", async () => {
    const { ClaudeProvider } = await load("providers/claude.mjs");
    const { CodexProvider } = await load("providers/codex.mjs");
    const { CursorProvider } = await load("providers/cursor.mjs");
    const { OpenCodeProvider } = await load("providers/opencode.mjs");
    const claude = new ClaudeProvider({ which: () => true });
    const codex = new CodexProvider({ which: () => true });
    const cursor = new CursorProvider({ which: () => true });
    const opencode = new OpenCodeProvider({ which: () => true });
    assert.deepEqual(claude.buildStartArgs({ model: "inherit" }), []);
    assert.deepEqual(claude.buildStartArgs({ model: "opus" }), ["--model", "opus"]);
    assert.deepEqual(claude.buildStartArgs({ model: "opus", effort: "high" }), [
      "--model",
      "opus",
      "--effort",
      "high",
    ]);
    assert.deepEqual(codex.buildStartArgs({ model: "gpt-5.4" }), ["-m", "gpt-5.4"]);
    assert.deepEqual(codex.buildStartArgs({ model: "gpt-5.4", effort: "high" }), [
      "-m",
      "gpt-5.4",
      "-c",
      "model_reasoning_effort=high",
    ]);
    assert.deepEqual(cursor.buildStartArgs({ model: "grok-4.6", mode: "plan" }), [
      "--model",
      "grok-4.6",
      "--mode",
      "plan",
    ]);
    assert.equal(claude.kind, "claude");
    assert.equal(codex.kind, "codex");
    assert.equal(cursor.kind, "cursor");
    assert.deepEqual(opencode.buildStartArgs({ model: "openai/gpt-5", effort: "high" }), [
      "-m",
      "openai/gpt-5",
      "--variant",
      "high",
    ]);
    assert.deepEqual(opencode.buildStartArgs({ model: "openai/gpt-5", effort: "xhigh" }), [
      "-m",
      "openai/gpt-5",
      "--variant",
      "max",
    ]);
    assert.equal(opencode.kind, "opencode");
  });

  it("probe: missing CLI is disconnected; env quota 90/95", async () => {
    const { ClaudeProvider } = await load("providers/claude.mjs");
    const { CodexProvider } = await load("providers/codex.mjs");
    const { CursorProvider } = await load("providers/cursor.mjs");
    const quota = { sessionPct: 90, weeklyPct: 95 };
    const missing = new ClaudeProvider({ which: () => false });
    assert.deepEqual(await missing.probe({ quota }), {
      ok: false,
      reason: "disconnected",
    });

    const claude = new ClaudeProvider({ which: () => true });
    const high = await claude.probe({
      quota,
      env: { SDDHARNESS_CLAUDE_SESSION_PCT: "91" },
    });
    assert.equal(high.ok, false);
    assert.equal(high.reason, "quota");
    assert.equal(high.sessionPct, 91);

    const weekly = await new CodexProvider({ which: () => true }).probe({
      quota,
      env: { SDDHARNESS_CODEX_WEEKLY_PCT: "96" },
    });
    assert.equal(weekly.ok, false);
    assert.equal(weekly.weeklyPct, 96);

    const ok = await new CursorProvider({ which: () => true }).probe({
      quota,
      env: { SDDHARNESS_CURSOR_SESSION_PCT: "10", SDDHARNESS_CURSOR_WEEKLY_PCT: "20" },
    });
    assert.equal(ok.ok, true);
  });

  it("usedPercent converts remaining to used", async () => {
    const { usedPercent } = await load("provider.mjs");
    const { CodexProvider } = await load("providers/codex.mjs");
    assert.equal(usedPercent({ used: 25 }), 25);
    assert.equal(usedPercent({ remaining: 8 }), 92);
    assert.equal(usedPercent({ used: 10, remaining: 90 }), 10);
    const parsed = new CodexProvider({ which: () => true }).parseRateLimits({
      rateLimits: { primary: { remainingPercent: 8 }, secondary: { usedPercent: 12 } },
    });
    assert.equal(parsed.sessionPct, 92);
    assert.equal(parsed.weeklyPct, 12);
  });

  it("preamble includes HARNESS_ROOT and capabilities", async () => {
    const { AgentProvider } = await load("provider.mjs");
    const p = new AgentProvider();
    const text = p.buildPromptPreamble({
      role: "implementer",
      harnessRoot: "/repo",
      worktree: "/repo/.worktrees/f",
      capabilities: { read: true, writeCode: true, writeSpec: false, execute: true },
    });
    assert.match(text, /HARNESS_ROOT=\/repo/);
    assert.match(text, /WORKTREE=\/repo\/.worktrees\/f/);
    assert.match(text, /writeCode/);
  });
});
