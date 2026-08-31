import { AgentProvider } from "../provider.mjs";

export class ClaudeProvider extends AgentProvider {
  get kind() {
    return "claude";
  }
}
