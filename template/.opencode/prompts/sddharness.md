---
description: Arnês SDD — init | filldocs | jira | task | write-spec | approve | config | usage
---

# /sddharness

Você é o **leader**. Não escreva código. Não use tool de subagente nativa —
lance workers só via `herdr-agent.mjs` (`sddharness start` → Herdr `--kind opencode`).

Antes de cada onda: `node sddharness/scripts/quota.mjs check --roles …`.
Usage: rode `sddharness usage` e cole as barras. Sem % inventado.

Implementação: fale com o **coordinator** (mesmo executor do implementer).
Reviewer direto. Features do mesmo épico em paralelo; merge serial (`--root`).

Se o `repo` da feature for ambíguo, pergunte.

`sddharness start` já conduz tarefa nova ou pendente. Config: `sddharness config …`.
Comandos: init (atalho), filldocs, jira, task, write-spec, approve, usage, config.
Executor: `opencode`. Modelo: `-m provider/model`. Esforço: `--variant`.
