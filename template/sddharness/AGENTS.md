# AGENTS.md — Mapa de navegação para agentes de IA

> Este arquivo é o **ponto de entrada** para qualquer agente que trabalhe
> neste repositório. NÃO é uma bíblia de regras: é um **mapa**.

---

## 1. Antes de começar (obrigatório)

1. Execute `./sddharness/init.sh`. Se falhar, **pare**.
2. Docs prontos: `node sddharness/scripts/docs-ready.mjs` (senão `/sddharness filldocs` ou `init`).
3. Leia `sddharness/progress/current.md`, `sddharness/feature_list.json`, `sddharness/docs/specs.md`.
4. `sddharness config list` (home/workspace). Repo `.sddharness/config.json` só `verifyCmd`. `session.json` se existir.

## 2. Mapa do repositório

| Arquivo / pasta | O que contém |
|---|---|
| `sddharness/feature_list.json` | Lista de features e estados |
| `sddharness/specs/` | Specs SDD por feature |
| `sddharness/progress/` | Progresso da sessão |
| `sddharness/docs/*` | Arquitetura, convenções, verificação, specs SDD |
| `sddharness/scripts/` | validate-features, docs-ready, git-session, import-task, config, herdr-agent |
| `.sddharness/config.json` | só `verifyCmd` do repo |
| `~/.sddharness/config.json` | runtime, executor/model/mode/effort, quota; overlays `--task` / `--feature` |
| `~/.sddharness/` | workspaces, feature_list do épico, lock, snapshot de cota |
| `.sddharness/session.json` | Branch mãe + worktrees da sessão (Jira ou task) |
| `.worktrees/` | Worktrees por feature (gitignored) |
| `.claude/agents/` / `.cursor/agents/` | Subagentes |

## 3. Regras rígidas

- Features do mesmo épico em ondas (`maxParallel`); merge serial por repo.
- Docs prontos antes de jira / task / write-spec / approve.
- Código da feature no **worktree**; artefatos SDD em **sddharness/**.
- `write-spec` → approve humano → `approve` (loop até `maxReviewCycles`) → merge.
- Sem subcomando `execute`.
- `runtime=herdr`: workers via `herdr-agent.mjs` (Herdr não cria worktrees).
  Exits 3/4 = pare / pergunte executor. Sem `fallbackOrder`, não auto-escolha.

## 4. Fluxo

```
filldocs → jira|task (repo por feature) → quota check
  → write-spec em onda → ⏸ approve (feature ou lote)
  → coordinator → implementers (+ review) → merge serial por repo
```

`/sddharness usage` mostra barras de sessão/ciclo. Leader Claude/Codex/Cursor/OpenCode: `sddharness start`.

Frases canônicas: ver `leader.md` / README (base atual, criando branch,
criando worktree, fazendo merge).

## 5. Encerramento

`./sddharness/init.sh` verde; `done` após APPROVED + merge; limpe `sddharness/progress/current.md`.

## 6. Se travar

Documente em `sddharness/progress/current.md` e pare — sem workaround inventado.
