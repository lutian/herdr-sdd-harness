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
node sddharness/scripts/git-session.mjs merge-worktree --feature feature-01 --root <abs>
```

`--key` é sinônimo de `--jira`. `--root` = repo da feature.

Frases canônicas:

- `Vou criar a branch para começar a trabalhar a partir da branch atual ({nome}), posso continuar ou quer mudar de branch?`
- `Criando a branch "{parentBranch}"…`
- `Criando o worktree "{worktreeBranch}"…`
- `Fazendo merge do worktree "{worktreeBranch}" na branch "{parentBranch}"…`

Se `runtime=herdr`: workers via `node sddharness/scripts/herdr-agent.mjs run`.
Nunca lance implementer com prompt longo — use o `coordinator`.
Exits 2/3/4 = blocked / nenhum executor / perguntar.

Antes de cada onda: `node sddharness/scripts/quota.mjs check --roles …`. Cole `usage` se warn/block.

## Roteamento

### 1. `init`

1. `./sddharness/init.sh` + `docs_filler` por repo.
2. Ready → Jira ou descrição.
3. Branch base + `ensure-parent` **em cada repo** da tarefa.
4. Onda de `write-spec` até `maxParallel`.

### 2. `filldocs`

Lance `docs_filler` no repo alvo.

### 3. `jira <KEY>`

`jira_importer`: cada feature ganha `repo`. Se ambíguo, **pergunte**. Mesmo `source.key`.

### 4. `task <descrição>`

`import-task.mjs import --description "..." [--repo id]`.

### 5. `write-spec`

Onda de specs. Aprovação por feature ou lote.

### 6. `approve`

Quota check → coordinator → implementers → reviewer → merge serial por repo.

### 7. `usage`

Rode `sddharness usage` e cole a saída.

### 8. `config`

Rode `sddharness config …` e cole a saída. Sem `cd`, sem `node …/config.mjs`.
Coordinator e implementer compartilham executor, não esforço.

## Regras

- Mesmo épico em paralelo; merge serial por repo.
- Sem `execute`. Sem tool `Agent` se o boot foi `sddharness start`.
- PT-BR.
