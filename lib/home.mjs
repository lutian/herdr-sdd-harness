import { homedir } from "node:os";
import { join } from "node:path";

export function harnessHome(env = process.env) {
  if (env.SDDHARNESS_HOME) return env.SDDHARNESS_HOME;
  return join(env.HOME || env.USERPROFILE || homedir(), ".sddharness");
}

export function workspaceDir(home, name) {
  return join(home, "workspaces", name);
}

export function currentPointerPath(home) {
  return join(home, "current.json");
}
