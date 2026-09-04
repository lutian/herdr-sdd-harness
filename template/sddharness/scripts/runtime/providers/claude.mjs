import { spawnSync } from "node:child_process";
import { AgentProvider, usedPercent } from "../provider.mjs";

export class ClaudeProvider extends AgentProvider {
  get kind() {
    return "claude";
  }

  parseUsage(payload) {
    const usage = payload?.usage || payload?.result || payload;
    return {
      sessionPct: usedPercent({
        used: usage?.session_percent ?? usage?.used_percent ?? usage?.five_hour_percent,
        remaining: usage?.session_remaining_percent,
      }),
      weeklyPct: usedPercent({
        used: usage?.weekly_percent ?? usage?.seven_day_percent ?? usage?.cycle_percent,
      }),
    };
  }

  async readLiveQuota() {
    const bin = this.cliNames.find((name) => this.which(name));
    if (!bin) return {};
    for (const args of [
      ["usage", "--json"],
      ["status", "--format", "json"],
    ]) {
      const r = spawnSync(bin, args, { encoding: "utf8", timeout: 8000 });
      if (r.status !== 0) continue;
      try {
        const parsed = this.parseUsage(JSON.parse(r.stdout));
        if (parsed.sessionPct != null || parsed.weeklyPct != null) return parsed;
      } catch {
        /* next */
      }
    }
    return {};
  }
}
