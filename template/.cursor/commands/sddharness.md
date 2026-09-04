---
description: Arnês SDD — init | filldocs | jira | task | write-spec | approve | config | usage
---

# /sddharness

Comando unificado do mini-arnês Spec Driven Development.

## Uso

```
/sddharness init
/sddharness filldocs
/sddharness jira <KEY>
/sddharness task <descrição da tarefa>
/sddharness write-spec <feature-XX>
/sddharness approve <feature-XX>
/sddharness usage
/sddharness config list
/sddharness config set <agente> executor|model|mode|effort <valor>
/sddharness config set runtime <native|herdr>
/sddharness config set --task KEY <agente> executor <valor>
/sddharness config set --feature feature-XX <agente> executor <valor>
/sddharness config set orchestration maxReviewCycles <n>
/sddharness config set orchestration maxParallel <n>
```

`$ARGUMENTS` = resto da linha após `/sddharness`.

CLI `sddharness init <path>` = instalar skeleton.  
`sddharness start` já abre o leader e conduz tarefa nova ou pendente.  
Slash `/sddharness init` = atalho opcional do mesmo fluxo.

## Gate de docs

Antes de `jira` / `task` / `write-spec` / `approve`: `node sddharness/scripts/docs-ready.mjs`.

## Git (obrigatório no fluxo)

```bash
node sddharness/scripts/git-session.mjs current-branch
node sddharness/scripts/git-session.mjs ensure-parent --jira KEY --title "..."
node sddharness/scripts/git-session.mjs ensure-parent --key KEY --title "..."
node sddharness/scripts/git-session.mjs add-worktree --jira KEY --feature feature-01 --title "..."
node sddharness/scripts/git-session.mjs add-worktree --key KEY --feature feature-01 --title "..."
node sddharness/scripts/git-session.mjs merge-worktree --feature feature-01
```

`--key` é sinônimo de `--jira` (chave da sessão: id Jira ou id numérico da task).

Frases canônicas:

- `Vou criar a branch para começar a trabalhar a partir da branch atual ({nome}), posso continuar ou quer mudar de branch?`
- `Criando a branch "{parentBranch}"…`
- `Criando o worktree "{worktreeBranch}"…`
- `Fazendo merge do worktree "{worktreeBranch}" na branch "{parentBranch}"…`

Arnês em `sddharness/`; código no worktree (`.worktrees/`).

Se `runtime=herdr`: workers via `node sddharness/scripts/herdr-agent.mjs run --feature <name>`.
Nome Herdr = `<role>-<feature>` (ex.: `implementer-feature-01`) para paralelo.
Herdr **não** cria worktrees. Exits 2/3/4 = blocked / nenhum executor / perguntar.

## Roteamento

### 1. `init`

1. `./sddharness/init.sh` + `docs_filler`.
2. Blocked → pare.
3. Ready → `Insira o id da tarefa do Jira, ou cole a descrição da tarefa`
4. Texto no formato `PROJ-123` → `jira`. Qualquer outro texto → `task`.
5. `current-branch` → pergunta da base atual.
6. Continuar → `Criando a branch "…"…` + `ensure-parent`.
7. `Quer que inicie o fluxo com a feature-01?`
8. Sim → `write-spec` → `Aprova…?` → `approve` (com merge) → próxima.

### 2. `filldocs`

Lance `docs_filler`.

### 3. `jira <KEY>`

1. Docs prontos → `jira_importer`.
2. Leader (não o importer) conduz pergunta da base + `ensure-parent`.
3. Depois: `Quer que inicie o fluxo com a feature-01?`

### 4. `task <descrição>`

Para quem não usa Jira. Cole o texto da tarefa.

1. Docs prontos → `node sddharness/scripts/import-task.mjs import --description "..."`.
2. O script aloca o próximo id em `sddharness/progress/history.md` (1 se vazio; senão N+1) e grava `source.type: "manual"`.
3. Leader conduz pergunta da base + `ensure-parent --key <id>`.
4. Depois: `Quer que inicie o fluxo com a feature-01?`

### 5. `write-spec <feature-XX>`

1. Docs + session com parentBranch.
2. `Criando o worktree "…"…` + `add-worktree`.
3. `spec_author` em paralelo até `maxParallel` (specs em `sddharness/specs/`) → `spec_ready` → pergunta approve (feature ou lote).

### 6. `approve <feature-XX>[,feature-YY]`

Antes: `node sddharness/scripts/quota.mjs check --roles coordinator,implementer,reviewer`.
warn → mostre `/sddharness usage` e pergunte se continua ou troca executor. block → não lance.
1. Só features aprovadas: `in_progress` → coordinator (mesmo executor do implementer) lança implementers em paralelo. Reviewer direto do leader.
2. Loop até `maxReviewCycles`. Merge **serial por repo** (`--root` do repo).
3. `runtime=herdr`: `herdr-agent.mjs run`. Exits 2/3/4 = blocked / nenhum / perguntar.

### 7. `usage`

Rode `sddharness usage` ou `node sddharness/scripts/quota.mjs usage` e **cole a saída**. Não invente %.

### 8. `config`

```
sddharness config list
sddharness config set <role> executor|model|mode|effort <valor>
sddharness config set --task KEY implementer executor opencode
sddharness config set --feature feature-01 reviewer executor claude
sddharness config set model <slug> effort <valor>
sddharness config set runtime native|herdr
```

Agentes: `leader`, `spec_author`, `coordinator`, `implementer`, `reviewer`, `jira_importer`, `docs_filler`.
Coordinator e implementer compartilham executor.

## Regras

- Features do mesmo épico em ondas; merge serial por repo.
- Sem `execute` — use `write-spec`.
- Confirmações `Sim`/`Aprovo`/`continuar` no chat valem como o próximo passo.
- PT-BR.
