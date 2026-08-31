import { EXECUTORS } from "./provider.mjs";

export function quotaReason(executor, probe) {
  if (probe.reason === "disconnected") return `${executor} indisponível: desconectado`;
  if (probe.reason === "quota") {
    if (probe.sessionPct != null && probe.weeklyPct != null) {
      return `${executor} indisponível: sessão ${probe.sessionPct}% / ciclo ${probe.weeklyPct}%`;
    }
    if (probe.sessionPct != null) return `${executor} indisponível: sessão ${probe.sessionPct}%`;
    if (probe.weeklyPct != null) return `${executor} indisponível: ciclo ${probe.weeklyPct}%`;
    return `${executor} indisponível: quota`;
  }
  return `${executor} indisponível: ${probe.reason || "desconhecido"}`;
}

export async function resolveExecutor({
  configured,
  providers,
  quota,
  fallbackOrder,
  override,
  env = process.env,
}) {
  const target = override || configured;
  const first = await providers[target].probe({ quota, env });
  if (first.ok) return { executor: target, probe: first, probes: { [target]: first } };

  const probes = { [target]: first };
  for (const name of EXECUTORS) {
    if (probes[name]) continue;
    probes[name] = await providers[name].probe({ quota, env });
  }
  const available = EXECUTORS.filter((name) => probes[name].ok);
  if (available.length === 0) {
    return { error: "none", code: 3, probes };
  }
  if (Array.isArray(fallbackOrder) && fallbackOrder.length) {
    const pick = fallbackOrder.find((name) => name !== target && probes[name]?.ok);
    if (pick) {
      return {
        executor: pick,
        probe: probes[pick],
        probes,
        announced: `executor definido: ${pick} (${quotaReason(target, first)})`,
      };
    }
  }
  return { error: "ask", code: 4, available, probes };
}
