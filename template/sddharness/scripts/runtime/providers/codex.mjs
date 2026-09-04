import { spawnSync } from "node:child_process";
import { AgentProvider, usedPercent } from "../provider.mjs";

export class CodexProvider extends AgentProvider {
  get kind() {
    return "codex";
  }

  modelFlag(model) {
    return ["-m", model];
  }

  async readLiveQuota() {
    const bin = this.cliNames.find((name) => this.which(name));
    if (!bin) return {};
    for (const args of [["status", "--json"], ["app-server", "rate-limits"]]) {
      const r = spawnSync(bin, args, { encoding: "utf8", timeout: 8000 });
      if (r.status !== 0) continue;
      try {
        const parsed = this.parseRateLimits(JSON.parse(r.stdout));
        if (parsed.sessionPct != null || parsed.weeklyPct != null) return parsed;
      } catch {
        /* next */
      }
    }
    return {};
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
