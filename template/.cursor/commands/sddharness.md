---
description: Arnês SDD — init | filldocs | jira | task | write-spec | approve | config
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
/sddharness config list
/sddharness config <agente> executor|model|mode <valor>
/sddharness config runtime <native|herdr>
/sddharness config orchestration maxReviewCycles <n>
```

`$ARGUMENTS` = resto da linha após `/sddharness`.

CLI `./bin/sddharness init <path>` = instalar skeleton.  
Slash `/sddharness init` = sessão amigável.

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

Se `runtime=herdr`: workers via `node sddharness/scripts/herdr-agent.mjs run`.
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
3. `spec_author` (specs em `sddharness/specs/`) → `spec_ready` → pergunta approve.

### 6. `approve <feature-XX>`

1. `in_progress` → loop até `maxReviewCycles` (default 3):
   implementer → reviewer. APPROVED → `done`. CHANGES_REQUESTED →
   próximo ciclo. Sem aprovação → `blocked` e espere o humano.
2. Se `runtime=herdr`: `herdr-agent.mjs run` (cwd = worktree). Exits
   2/3/4 = blocked / nenhum executor / perguntar executor.
3. `Fazendo merge do worktree "…" na branch "{parent}"…` + `merge-worktree`.
4. Próxima feature.

### 7. `config`

```
node sddharness/scripts/config.mjs list
node sddharness/scripts/config.mjs set <role> executor|model|mode <valor>
node sddharness/scripts/config.mjs set runtime native|herdr
```

Agentes: `leader`, `spec_author`, `implementer`, `reviewer`, `jira_importer`, `docs_filler`.
`/sddharness config list` lista executors, models e maxReviewCycles.

## Regras

- Uma feature por vez.
- Sem `execute` — use `write-spec`.
- Confirmações `Sim`/`Aprovo`/`continuar` no chat valem como o próximo passo.
- PT-BR.
