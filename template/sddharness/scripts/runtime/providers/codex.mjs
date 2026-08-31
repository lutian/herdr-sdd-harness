import { AgentProvider, usedPercent } from "../provider.mjs";

export class CodexProvider extends AgentProvider {
  get kind() {
    return "codex";
  }

  modelFlag(model) {
    return ["-m", model];
  }

  parseRateLimits(payload) {
    const limits = payload?.rateLimits || payload?.result?.rateLimits || payload;
    const primary = limits?.primary || limits?.five_hour;
    const secondary = limits?.secondary || limits?.seven_day;
    return {
      sessionPct: usedPercent({
        used: primary?.usedPercent ?? primary?.used_percent,
        remaining: primary?.remainingPercent ?? primary?.remaining_percent,
      }),
      weeklyPct: usedPercent({
        used: secondary?.usedPercent ?? secondary?.used_percent,
        remaining: secondary?.remainingPercent ?? secondary?.remaining_percent,
      }),
    };
  }
}
