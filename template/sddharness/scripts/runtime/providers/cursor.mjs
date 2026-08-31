import { spawnSync } from "node:child_process";
import { AgentProvider, usedPercent } from "../provider.mjs";

export class CursorProvider extends AgentProvider {
  get kind() {
    return "cursor";
  }

  get cliNames() {
    return ["agent", "cursor-agent"];
  }

  parseStatus(payload) {
    const usage = payload?.usage || payload?.result || payload;
    return {
      sessionPct: usedPercent({
        used: usage?.used_percent ?? usage?.session_percent,
        remaining: usage?.remaining_percent,
      }),
      weeklyPct: usedPercent({
        used: usage?.weekly_percent ?? usage?.monthly_percent ?? usage?.cycle_percent,
      }),
    };
  }

  async readLiveQuota() {
    const bin = this.cliNames.find((name) => this.which(name));
    if (!bin) return {};
    const r = spawnSync(bin, ["status", "--format", "json"], {
      encoding: "utf8",
      timeout: 8000,
    });
    if (r.status !== 0) return {};
    try {
      return this.parseStatus(JSON.parse(r.stdout));
    } catch {
      return {};
    }
  }
}
