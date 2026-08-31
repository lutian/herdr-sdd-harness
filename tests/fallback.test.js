import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ClaudeProvider } from "../template/sddharness/scripts/runtime/providers/claude.mjs";
import { CodexProvider } from "../template/sddharness/scripts/runtime/providers/codex.mjs";
import { CursorProvider } from "../template/sddharness/scripts/runtime/providers/cursor.mjs";

const FALLBACK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "template",
  "sddharness",
  "scripts",
  "runtime",
  "fallback.mjs"
);

function providers() {
  return {
    claude: new ClaudeProvider({ which: () => true }),
    codex: new CodexProvider({ which: () => true }),
    cursor: new CursorProvider({ which: () => true }),
  };
}

describe("resolveExecutor", () => {
  it("asks the user when configured is down and fallbackOrder is missing", async () => {
    const { resolveExecutor } = await import(pathToFileURL(FALLBACK).href);
    const result = await resolveExecutor({
      configured: "claude",
      providers: providers(),
      quota: { sessionPct: 90, weeklyPct: 95 },
      env: {
        SDDHARNESS_CLAUDE_SESSION_PCT: "92",
        SDDHARNESS_CURSOR_SESSION_PCT: "10",
        SDDHARNESS_CODEX_SESSION_PCT: "10",
      },
    });
    assert.equal(result.error, "ask");
    assert.equal(result.code, 4);
    assert.ok(result.available.includes("cursor"));
    assert.ok(!result.executor);
  });

  it("skips Codex at 91% session and picks next in fallbackOrder", async () => {
    const { resolveExecutor } = await import(pathToFileURL(FALLBACK).href);
    const result = await resolveExecutor({
      configured: "codex",
      providers: providers(),
      quota: { sessionPct: 90, weeklyPct: 95 },
      fallbackOrder: ["codex", "cursor", "claude"],
      env: {
        SDDHARNESS_CODEX_SESSION_PCT: "91",
        SDDHARNESS_CURSOR_SESSION_PCT: "5",
        SDDHARNESS_CLAUDE_SESSION_PCT: "5",
      },
    });
    assert.equal(result.executor, "cursor");
    assert.match(result.announced, /executor definido: cursor/);
    assert.match(result.announced, /sessão 91%/);
  });

  it("exits 3 when every executor is unavailable", async () => {
    const { resolveExecutor } = await import(pathToFileURL(FALLBACK).href);
    const result = await resolveExecutor({
      configured: "claude",
      providers: {
        claude: new ClaudeProvider({ which: () => false }),
        codex: new CodexProvider({ which: () => false }),
        cursor: new CursorProvider({ which: () => false }),
      },
      quota: { sessionPct: 90, weeklyPct: 95 },
      fallbackOrder: ["cursor", "codex", "claude"],
    });
    assert.equal(result.error, "none");
    assert.equal(result.code, 3);
  });
});
