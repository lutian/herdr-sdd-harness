import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkWave,
  classifyBand,
  formatBar,
  formatUsage,
  suggestExecutors,
} from "../lib/quota.mjs";
import { effortStartArgs, resolveEffort } from "../lib/effort.mjs";

describe("quota bands + bars", () => {
  const q = { sessionPct: 90, weeklyPct: 95, warnSessionPct: 70, warnWeeklyPct: 80 };

  it("classifies ok/warn/block/unknown", () => {
    assert.equal(classifyBand({ sessionPct: 10, weeklyPct: 10 }, q), "ok");
    assert.equal(classifyBand({ sessionPct: 82, weeklyPct: 10 }, q), "warn");
    assert.equal(classifyBand({ sessionPct: 91, weeklyPct: 10 }, q), "block");
    assert.equal(classifyBand({}, q), "unknown");
    assert.equal(classifyBand({ reason: "disconnected" }, q), "unknown");
  });

  it("renders 20-col bars and usage block", () => {
    assert.match(formatBar(82), /█{16}░{4}/);
    assert.match(formatBar(82), /82%/);
    assert.match(formatBar(null), /\?%/);
    const text = formatUsage([
      { executor: "claude", band: "warn", roles: ["leader"], sessionPct: 82, weeklyPct: 61 },
    ]);
    assert.match(text, /claude/);
    assert.match(text, /sessão/);
    assert.match(text, /ciclo/);
    assert.match(text, /82%/);
  });

  it("wave check never auto-switches", () => {
    const result = checkWave(
      { claude: { sessionPct: 91, weeklyPct: 10 }, cursor: { sessionPct: 10, weeklyPct: 10 } },
      { leader: "claude", spec_author: "cursor" },
      q
    );
    assert.equal(result.worst, "block");
    assert.equal(result.autoSwitch, false);
    assert.deepEqual(suggestExecutors(
      { claude: { sessionPct: 91 }, cursor: { sessionPct: 10 }, codex: { sessionPct: 20 } },
      q,
      ["codex", "cursor", "claude"]
    ), ["codex", "cursor"]);
  });
});

describe("effort", () => {
  it("resolves role then model then default", () => {
    assert.equal(
      resolveEffort({
        role: "implementer",
        agent: { effort: "low", model: "gpt-5.6-terra" },
        models: { "gpt-5.6-terra": { effort: "high" } },
      }),
      "low"
    );
    assert.equal(
      resolveEffort({
        role: "implementer",
        agent: { effort: "inherit", model: "gpt-5.6-terra" },
        models: { "gpt-5.6-terra": { effort: "high" } },
      }),
      "high"
    );
    assert.equal(resolveEffort({ role: "implementer", agent: {} }), "high");
    assert.equal(resolveEffort({ role: "reviewer", agent: {} }), "low");
    assert.deepEqual(effortStartArgs("claude", "high"), ["--effort", "high"]);
    assert.deepEqual(effortStartArgs("codex", "high"), ["-c", "model_reasoning_effort=high"]);
    assert.deepEqual(effortStartArgs("cursor", "high"), []);
    assert.deepEqual(effortStartArgs("opencode", "high"), ["--variant", "high"]);
    assert.deepEqual(effortStartArgs("opencode", "xhigh"), ["--variant", "max"]);
  });
});
