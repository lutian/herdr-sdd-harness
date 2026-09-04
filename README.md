# Herdr SDD Harness

Um arnês **global** (`~/.sddharness`) com workspaces de um ou mais
repos. Você fala só com o **leader** (Claude, Codex, Cursor ou OpenCode, via
`sddharness start` + Herdr). Ele quebra o épico por repo, pede
aprovação, abre worktrees e — via **coordinator** — implementa features
do mesmo ticket em paralelo.

O [Herdr](https://herdr.dev) é o terminal onde esses agentes rodam
(Claude Code, Codex, Cursor Agent e OpenCode), cada um no seu pane.

## Como funciona, em uma frase

Pedido → spec no disco → **você aprova** → implementação no worktree →
review → merge na branch da tarefa.

## 1. Instalar as ferramentas

Você precisa de **Node.js 20 ou superior** e destas CLIs no
`PATH`, já autenticadas (use as que for de fato executar).

### Herdr

Linux e macOS:

```bash
curl -fsSL https://herdr.dev/install.sh | sh
```

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"
```

Guia: [herdr.dev/docs/install](https://herdr.dev/docs/install/).

### Claude Code

Pode ser o leader ou um worker (você escolhe no config).

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude
```

Na primeira execução, autentique com a conta Anthropic.
Guia: [code.claude.com](https://code.claude.com/docs).

### Codex

É quem escreve o código da feature.

```bash
npm install -g @openai/codex
codex
```

Autentique com a conta OpenAI / ChatGPT.
Guia: [developers.openai.com/codex/cli](https://developers.openai.com/codex/cli).

### Cursor Agent

É quem redige o spec (e pode substituir outro papel, se você quiser).

```bash
curl https://cursor.com/install -fsS | bash
agent login
```

O comando pode se chamar `agent` ou `cursor-agent`, conforme a
instalação. Guia: [cursor.com/docs/cli](https://cursor.com/docs/cli/overview).

### OpenCode

Pode ser leader ou worker (`config set <papel> executor opencode`).

```bash
curl -fsSL https://opencode.ai/install | bash
opencode
```

Autentique no primeiro uso. Guia: [opencode.ai](https://opencode.ai).

### Conferir

```bash
node --version          # >= 20
herdr --version
claude --version
codex --version
agent --version || cursor-agent --version
opencode --version
```

### Ligar as integrações do Herdr

Com as CLIs no PATH:

```bash
herdr integration install claude
herdr integration install codex
herdr integration install cursor
herdr integration install opencode
herdr integration status
```

Assim o Herdr enxerga se um agente está trabalhando, ocioso, bloqueado
ou pronto.

## 2. Clonar este repositório

Este repo é o **instalador** do arnês, não o projeto em que você vai
codar.

```bash
git clone https://github.com/lutian/herdr-sdd-harness.git
cd herdr-sdd-harness
```

## 3. Instalar o CLI e criar um workspace

Na pasta deste repo (o instalador). Use `node bin/sddharness` — assim
você roda **este** clone, não um pacote antigo do cache do npm:

```bash
node bin/sddharness workspace create meu-time
node bin/sddharness repo add /caminho/do-repo-a
node bin/sddharness repo add /caminho/do-repo-b
node bin/sddharness start
```

`npm exec sddharness` só é seguro nesta pasta. Fora dela o npm pode
baixar outro `sddharness`. Se um `start` antigo deixou lock:

```bash
node bin/sddharness unlock
```

`init <path>` continua instalando artefatos no repo (e liga ao workspace
ativo). Home: `~/.sddharness` (ou `SDDHARNESS_HOME`).

No repo:

```
seu-projeto/
├── .sddharness/config.json   # só verifyCmd local
├── sddharness/
├── .claude/ .cursor/ .codex/
└── .worktrees/
```

Executors e runtime ficam em `~/.sddharness` (home e workspace).

## 4. Configurar quem faz o quê

Só pelo CLI / slash — sem `cd` no repo e sem `node …/config.mjs`:

```
/sddharness config list
/sddharness config set runtime herdr
/sddharness config set spec_author executor cursor
/sddharness config set spec_author mode plan
/sddharness config set implementer executor codex
/sddharness config set reviewer executor claude

/sddharness config set --task PROJ-123 implementer executor opencode
/sddharness config set --feature feature-01 reviewer executor claude
/sddharness config list --task PROJ-123
```

O mesmo no terminal: `node bin/sddharness config …`. Overlay `--task` / `--feature` não muda o default global. Resolução: feature → tarefa → workspace → home.

| Papel | Quem executa | Função |
|-------|----------------|--------|
| leader | Claude, Codex ou Cursor (`sddharness start`) | Pergunta, cria branch, coordena |
| coordinator | Mesmo executor do implementer | Traduz spec → tarefas dos implementers |
| spec_author | Cursor Agent (modo plan) | Escreve requirements, design e tasks |
| implementer | Codex | Implementa no worktree |
| reviewer | Claude Code | Aprova ou pede mudanças — sem editar código |

## 5. Primeira sessão

No seu projeto (ou em qualquer repo do workspace):

```bash
node bin/sddharness start
```

Cria um workspace/pane no Herdr **no repo** (o cwd, se for um repo do
workspace; senão o primeiro de `repo list`). É nesse cwd que o Claude
carrega `/sddharness` (`.claude/commands/`). Sem repo: `repo add` antes.

O dir `~/.sddharness/workspaces/<nome>` só guarda metadados (`boot-prompt.md`,
`feature_list.json`) — o leader não abre aí.

Se o servidor Herdr não estiver no ar, o start tenta subi-lo; no fim
anexa o TUI (`herdr`) se você não estiver já dentro de um pane.
Se já existir um agente chamado `leader`, o start **reusa** (focus + prompt)
em vez de criar outro. Para soltar o nome: `herdr agent rename leader --clear`.

Se houver tarefa/feature pendente, retoma; senão começa uma **tarefa nova**.
Não precisa de `/sddharness init` no chat (`/sddharness init` é só atalho).

Responda às perguntas. O fluxo típico é este:

1. O leader preenche (ou pede para preencher) os docs de stack do
   projeto. Sem esses docs, o resto não avança.
2. Ele pede o id do Jira **ou** a descrição da tarefa, se você não
   usa Jira.
3. Confirma a branch de partida:
   *Vou criar a branch para começar a trabalhar a partir da branch
   atual (main), posso continuar ou quer mudar de branch?*
4. Cria a branch da tarefa (`feature/PROJ-123-…` ou `feature/1-…`).
5. *Quer que inicie o fluxo com a feature-01?*
6. Cria um worktree e pede o spec. Você lê
   `sddharness/specs/feature-01/` e responde se aprova.
7. Só depois da sua aprovação o Codex implementa e o Claude revisa.
8. Se a review pedir mudanças, o Codex corrige e o review roda de
   novo (até 3 ciclos). Aprovado: merge na branch da tarefa.

No chat, `Sim`, `Aprovo` e `pode continuar` valem como o próximo passo.

### Checklist da primeira vez

- [ ] As quatro CLIs respondem no terminal.
- [ ] `config list` mostra `runtime: herdr`.
- [ ] `node bin/sddharness start` abriu o Herdr e o leader no executor do config.
- [ ] Tarefa nova pediu Jira ou a descrição; pendente retomou o estado.

## 6. Comandos que você usa

Digite no chat do leader (funciona no Claude Code e no Cursor):

| Comando | Quando usar |
|---------|-------------|
| `/sddharness init` | Atalho opcional do mesmo fluxo que o `start` já abre |
| `/sddharness filldocs` | Só preencher os docs de stack |
| `/sddharness jira PROJ-123` | Já tem ticket no Jira |
| `/sddharness task <descrição>` | Sem Jira: cola o texto da tarefa |
| `/sddharness write-spec feature-01` | Gerar o spec de uma feature |
| `/sddharness approve feature-01` | Depois que você leu e aprovou o spec |
| `/sddharness config list` | Ver executors, modelos e ciclos de review |
| `/sddharness config <papel> executor cursor` | Trocar quem executa um papel |
| `/sddharness config <papel> model <slug>` | Trocar o modelo |
| `/sddharness usage` | Barras de cota (sessão e ciclo) dos executores |
| `/sddharness config orchestration maxReviewCycles 3` | Limite do loop implementa → revisa |

Exemplos:

```
/sddharness task Adicionar login com Google via OAuth
/sddharness write-spec feature-01
/sddharness approve feature-01
/sddharness config spec_author model grok-4.6
```

O nome do modelo do Cursor é o que a sua conta lista (`agent models`).
`inherit` significa “usa o padrão daquele CLI”.

## 7. Se um agente não puder rodar

Antes de abrir Codex, Claude ou Cursor, o arnês verifica se o CLI
existe, se está autenticado e se a cota não estourou
(cerca de **90%** da janela da sessão ou **95%** do ciclo
semanal/mensal).

| O que acontece | O que você faz |
|----------------|----------------|
| O leader pergunta qual executor usar | Responda no chat, ou `/sddharness config <papel> executor …` |
| O leader diz que nenhum executor está disponível | Espere a cota, autentique de novo ou instale o CLI que faltou |
| Um pane pede confirmação (“trust this directory?”) | O leader mostra a tela e espera você — ele não aperta Enter sozinho |
| A review pediu mudanças três vezes e parou | Leia o review em `sddharness/progress/`, ajuste o spec ou o código e peça de novo |

Se quiser que o arnês escolha sozinho o próximo CLI disponível:

```
/sddharness config set orchestration fallbackOrder cursor,codex,claude
```

Sem essa lista, ele **sempre pergunta**.

## 8. O que o arnês guarda no seu repo

Você não precisa mexer nisso no dia a dia. Serve para achar as coisas.

| Onde | O quê |
|------|--------|
| `sddharness/docs/` | Arquitetura, convenções e como verificar o projeto |
| `sddharness/specs/feature-01/` | Spec aprovado (requirements, design, tasks) |
| `sddharness/progress/` | Relato da implementação e da review |
| `sddharness/feature_list.json` | Lista e status das features |
| `.worktrees/…` | Código da feature em andamento |
| `.sddharness/config.json` | Só `verifyCmd` do repo |
| `~/.sddharness/config.json` | Runtime, executors, overlays de tarefa/feature |

Regras que o leader segue:

- Features do mesmo épico em ondas; merge serial por repo.
- Código da feature só no worktree; spec e progresso na pasta `sddharness/`.
- Nada de implementação antes da sua aprovação do spec.

## Próximo passo

Instale as quatro ferramentas, crie o workspace com `node bin/sddharness`
e rode `node bin/sddharness start`. `/sddharness usage` mostra a cota.
