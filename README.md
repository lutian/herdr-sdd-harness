# sddharness + Herdr

Mini-arnês **Spec Driven Development (SDD)** que instala em qualquer
repositório e orquestra features com agentes. O estado mora no disco;
o Herdr (opt-in) só executa Claude Code, Codex e Cursor Agent.

Você conversa **só com o leader**. Spec, aprovação humana, git e merge
continuam no harness. Código da feature sai no worktree, não na raiz.

## Caminho rápido

1. Clone o kit e confirme Node ≥ 20.
2. Instale Herdr, Claude Code, Codex e Cursor Agent; autentique cada um.
3. Instale o skeleton no **projeto alvo** (`./bin/sddharness init …`).
4. Ligue `runtime=herdr` e o trio recomendado de executors.
5. Entre no projeto com `herdr`, rode `claude` **dentro** do pane e
   execute `/sddharness init`.

Checklist de verificação:

- [ ] `herdr --version`, `claude --version`, `codex --version` e `agent --version` (ou `cursor-agent --version`) respondem.
- [ ] `node sddharness/scripts/config.mjs list` no projeto alvo mostra `runtime: herdr`.
- [ ] O leader roda dentro do Herdr (`HERDR_ENV=1`). Sem isso o adapter recusa spawn.

## 1. Clonar o kit

Repositório: [github.com/lutian/herdr-sdd-harness](https://github.com/lutian/herdr-sdd-harness).

```bash
git clone https://github.com/lutian/herdr-sdd-harness.git
cd herdr-sdd-harness
node --version   # precisa ser >= 20
npm test         # opcional: testes do kit
```

Este clone **é o kit**, não o app em que você vai implementar features.
O passo 4 instala o skeleton no outro repositório.

## 2. Instalar as ferramentas

Precisam estar no `PATH` e autenticadas **antes** de ligar o runtime Herdr.

### Herdr

Linux / macOS:

```bash
curl -fsSL https://herdr.dev/install.sh | sh
```

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"
```

Docs: [herdr.dev/docs/install](https://herdr.dev/docs/install/).

### Claude Code

```bash
curl -fsSL https://claude.ai/install.sh | bash
# ou: npm install -g @anthropic-ai/claude-code
claude   # autentique na primeira execução
```

Docs: [code.claude.com](https://code.claude.com/docs).

### Codex CLI

```bash
npm install -g @openai/codex
# ou: brew install --cask codex
codex   # autentique (conta OpenAI / ChatGPT)
```

Docs: [developers.openai.com/codex/cli](https://developers.openai.com/codex/cli).

### Cursor Agent CLI

```bash
curl https://cursor.com/install -fsS | bash
```

O binário costuma ser `agent` e/ou `cursor-agent`. Autentique:

```bash
agent login
# ou: cursor-agent login
```

Docs: [cursor.com/docs/cli](https://cursor.com/docs/cli/overview).

### Conferir o PATH

```bash
herdr --version
claude --version
codex --version
agent --version || cursor-agent --version
node --version
```

### Integrações Herdr

Depois dos CLIs no PATH:

```bash
herdr integration install claude
herdr integration install codex
herdr integration install cursor
herdr integration status
```

Isso instala hooks para o Herdr ver `working` / `idle` / `blocked` / `done`.
Sem integração o spawn ainda pode funcionar, mas o estado fica menos
confiável.

## 3. Instalar o arnês no projeto alvo

Ainda no clone do kit:

```bash
./install.sh /caminho/do-seu-projeto
# ou
./bin/sddharness init /caminho/do-seu-projeto
```

A cópia é conservadora: arquivos que já existem não são sobrescritos.

### Estrutura no projeto alvo

```
projeto/
├── CLAUDE.md
├── .claude/                  # agents + /sddharness
├── .cursor/                  # agents + /sddharness
├── .sddharness/
│   ├── config.json           # runtime, executors, quota
│   └── session.json          # gitignored (git + panes Herdr)
├── .worktrees/               # gitignored
└── sddharness/
    ├── AGENTS.md
    ├── feature_list.json
    ├── docs/  progress/  specs/
    └── scripts/              # git-session, config, herdr-agent, runtime/
```

A partir daqui, **cwd = raiz do projeto alvo**.

## 4. Ligar o runtime Herdr

O default do skeleton é `runtime: native` (subagentes da IDE, sem Herdr).
Para o fluxo Codex / Claude / Cursor:

```bash
cd /caminho/do-seu-projeto
node sddharness/scripts/config.mjs set runtime herdr
node sddharness/scripts/config.mjs set spec_author executor cursor
node sddharness/scripts/config.mjs set spec_author mode plan
node sddharness/scripts/config.mjs set implementer executor codex
node sddharness/scripts/config.mjs set reviewer executor claude
node sddharness/scripts/config.mjs list
```

Trio recomendado (não é o default portátil):

| Role | executor | mode |
|------|----------|------|
| leader | claude (a sessão atual) | — |
| spec_author | cursor | plan |
| implementer | codex | agent |
| reviewer | claude | ask |

O leader **nunca** é spawnado pelo adapter. Ele já é o `claude` (ou o
Cursor) com quem você fala.

`inherit` no `model` = não passar `--model` ao CLI. O slug do Cursor
(Grok, etc.) é o que a **sua** conta expõe — não hardcodeie `grok-4.6`
sem conferir `agent models`.

## 5. Executar o arnês no dia a dia

```bash
cd /caminho/do-seu-projeto
herdr
```

Dentro do pane Herdr:

```bash
claude
```

Esse Claude é o **leader**. Depois:

```
/sddharness init
```

O que acontece:

1. `filldocs` — preenche architecture / conventions / verification (ou bloqueia se o repo estiver vazio).
2. Pede id Jira **ou** descrição da tarefa (sem Jira).
3. Pergunta a branch base: `Vou criar a branch para começar a trabalhar a partir da branch atual ({nome}), posso continuar ou quer mudar de branch?`
4. Cria a branch mãe (`feature/JIRA-123-…` ou `feature/1-…`).
5. `Quer que inicie o fluxo com a feature-01?`
6. Worktree + `write-spec` (spec_author no executor configurado).
7. `Aprova a feature-01 de "{título}"?` — **portão humano**. Sem isso não há código.
8. `approve`: implementer → reviewer, até `maxReviewCycles` (default 3).
9. Merge do worktree na branch mãe → próxima feature.

Confirmações no chat (`Sim`, `Aprovo`, `pode continuar`) valem como o
próximo passo.

Quem faz o quê:

| Camada | Dono |
|--------|------|
| Spec, gate humano, estado, git/worktrees | sddharness |
| Panes e execução dos CLIs | Herdr |
| Código da feature | worktree (`.worktrees/…`) |
| Artefatos SDD | `sddharness/` na **raiz** (`HARNESS_ROOT`) |

Herdr **não** cria worktrees. Só `git-session.mjs`.

## 6. Comandos `/sddharness`

Slash igual no Cursor e no Claude Code.

| Comando | Função |
|---------|--------|
| `/sddharness init` | Sessão amigável (filldocs → Jira/task → branch → spec → approve) |
| `/sddharness filldocs` | Preenche os 3 docs de stack |
| `/sddharness jira PROJ-123` | Importa features do Jira |
| `/sddharness task <descrição>` | Import sem Jira (id em `progress/history.md`) |
| `/sddharness write-spec feature-01` | Worktree + spec_author |
| `/sddharness approve feature-01` | Implement + review (loop) + merge |
| `/sddharness config list` | Mostra runtime, executors, models, modes, capabilities, cota |
| `/sddharness config <agente> executor\|model\|mode <valor>` | Troca um campo do role |
| `/sddharness config runtime native\|herdr` | Liga/desliga Herdr |
| `/sddharness config orchestration maxReviewCycles <n>` | Teto do loop de review |

Não existe `/sddharness execute`. Use `write-spec`.

O slash `config` grava via script (não edite o JSON à mão):

```bash
node sddharness/scripts/config.mjs get
node sddharness/scripts/config.mjs list
node sddharness/scripts/config.mjs set runtime herdr
node sddharness/scripts/config.mjs set spec_author executor cursor
node sddharness/scripts/config.mjs set spec_author model grok-4.6
node sddharness/scripts/config.mjs set spec_author mode plan
node sddharness/scripts/config.mjs set spec_author capabilities.writeCode false
node sddharness/scripts/config.mjs set orchestration maxReviewCycles 3
node sddharness/scripts/config.mjs set orchestration fallbackOrder cursor,codex,claude
node sddharness/scripts/config.mjs set quota sessionPct 90
```

`config.mjs` faz merge: `verifyCmd` e outras chaves desconhecidas
permanecem.

### Exemplo de `config list`

```
runtime: herdr
maxReviewCycles: 3
fallbackOrder: (não definido — fallback pergunta ao usuário)
quota: sessão >= 90% | ciclo (semanal/mensal) >= 95% → claude, codex e cursor indisponíveis

role            executor  model     mode   capabilities
leader          claude    inherit   -      read,execute
spec_author     cursor    inherit   plan   read,writeSpec
implementer     codex     inherit   agent  read,writeCode,execute
reviewer        claude    inherit   ask    read,execute
```

## 7. Fallback e cota

Antes de cada `spawn`/`run` o harness faz `probe` do executor do role
(PATH, auth e % usado).

| Situação | Comportamento |
|----------|----------------|
| Executor ok | Usa o configurado |
| Falhou **e** existe `orchestration.fallbackOrder` | Escolhe o próximo disponível da lista e anuncia `executor definido: cursor (claude indisponível: sessão 92%)` |
| Falhou **e** não há `fallbackOrder` | **Não** auto-escolhe. Exit 4. O leader pergunta e espera |
| Nenhum executor disponível | Exit 3. Para, alerta e espera você |

A troca **não** reescreve o default global em `config.json`. Fica em
`session.json` (`executorResolved`) só para aquela feature.

Cota (os três executors, sempre % **usado**):

| Janela | Corte default |
|--------|----------------|
| Sessão (~5h, se o CLI expor) | ≥ 90% → indisponível |
| Ciclo (semanal Claude/Codex, mensal Cursor) | ≥ 95% → indisponível |

Se a cota for desconhecida mas o CLI estiver autenticado, o harness
trata como disponível (evita falso positivo). CLI ausente ou auth
falha = `disconnected`.

`blocked` no Herdr (diálogo “trust this directory?”, etc.) **não**
recebe `send-keys` automático. O adapter lê a tela (exit 2) e o leader
mostra para você.

Para auto-pick:

```bash
node sddharness/scripts/config.mjs set orchestration fallbackOrder cursor,codex,claude
```

## 8. Adapter Herdr (o leader chama; você quase não)

Só vale com `runtime=herdr` **e** `HERDR_ENV=1` (leader dentro de um pane).

```bash
node sddharness/scripts/herdr-agent.mjs run --role implementer --cwd /abs/worktree --feature feature-01 --prompt "..."
node sddharness/scripts/herdr-agent.mjs spawn --role spec_author --cwd /abs/repo
node sddharness/scripts/herdr-agent.mjs prompt --role implementer --prompt "..."
node sddharness/scripts/herdr-agent.mjs wait --role implementer
node sddharness/scripts/herdr-agent.mjs read --role implementer
```

Exits: `2` blocked, `3` nenhum executor, `4` pergunte o executor.

`implementer` e `reviewer` nascem no worktree. `spec_author`,
`docs_filler` e `jira_importer` na raiz. Todo prompt leva
`HARNESS_ROOT` + `WORKTREE` + `capabilities`.

## 9. Git / worktrees

Scripts (cwd = raiz do projeto):

```bash
node sddharness/scripts/git-session.mjs current-branch
node sddharness/scripts/git-session.mjs ensure-parent --jira KEY --title "..."
node sddharness/scripts/git-session.mjs ensure-parent --key KEY --title "..."
node sddharness/scripts/git-session.mjs add-worktree --jira KEY --feature feature-01 --title "..."
node sddharness/scripts/git-session.mjs merge-worktree --feature feature-01
node sddharness/scripts/git-session.mjs record-agent --feature feature-01 --role implementer --executor codex --pane w1:p2
node sddharness/scripts/import-task.mjs import --description "..."
```

`--key` é sinônimo de `--jira`.

| Artefato | Exemplo Jira | Exemplo task |
|----------|--------------|--------------|
| Branch mãe | `feature/JIRA-123-atualizacao-servico-payment` | `feature/1-atualizacao-servico-payment` |
| Worktree | `feature/JIRA-123-01-implementando-adapters` | `feature/1-01-implementando-adapters` |
| Path | `.worktrees/JIRA-123-01-implementando-adapters` | `.worktrees/1-01-implementando-adapters` |

Uma feature por vez. Um writer no worktree. Reviewer não edita código.

## 10. Agentes

| Role | Papel | capabilities default |
|------|--------|----------------------|
| `leader` | Orquestra; git + perguntas | read, execute |
| `docs_filler` | Docs de stack | read, writeSpec |
| `jira_importer` | Jira → `feature_list.json` | read, writeSpec |
| — | `import-task.mjs` (task manual) | — |
| `spec_author` | Specs em `sddharness/specs/` | read, writeSpec |
| `implementer` | Código no worktree | read, writeCode, execute |
| `reviewer` | Aprova ou pede mudanças | read, execute |

`approve` faz implementer → reviewer até `APPROVED` ou
`maxReviewCycles`. Sem aprovação vira `blocked` e espera você.

## 11. Runtime `native` (sem Herdr)

O skeleton já nasce assim. O leader usa a tool `Agent` da IDE
(Claude Code / Cursor). Git, gate humano e specs são os mesmos.
Fallback de cota/CLI no contrato do leader também vale quando o
probe falha.

Para voltar:

```bash
node sddharness/scripts/config.mjs set runtime native
```

## 12. Validação

No projeto alvo:

```bash
./sddharness/init.sh
node sddharness/scripts/docs-ready.mjs
node sddharness/scripts/config.mjs list
```

No kit:

```bash
npm test
```

## Fora desta versão

Override por feature (`/sddharness approve --implementer cursor`),
executor `grok` CLI e validação live de slugs de modelo.

---

Baseado em [betta-tech/harness-sdd](https://github.com/betta-tech/harness-sdd/tree/uncle-bob-harness).
