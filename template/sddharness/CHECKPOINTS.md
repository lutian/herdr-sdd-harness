# CHECKPOINTS — Avaliação do estado final

> Em sistemas multi-agente não se avalia o caminho, avalia-se o destino.
> Estes são os checkpoints objetivos que um juiz (humano ou IA) pode usar
> para decidir se o projeto está saudável.

## C1 — O arnês está completo

- [ ] Existem os arquivos base: `sddharness/AGENTS.md`, `sddharness/init.sh`,
      `sddharness/feature_list.json`, `sddharness/progress/current.md`, `.sddharness/config.json`.
- [ ] Existem os docs: `sddharness/docs/architecture.md`, `sddharness/docs/conventions.md`,
      `sddharness/docs/verification.md`, `sddharness/docs/specs.md`.
- [ ] `./sddharness/init.sh` termina com exit code 0.

## C2 — O estado é coerente

- [ ] No máximo uma feature em `in_progress` em `sddharness/feature_list.json`.
- [ ] Toda feature `done` tem evidência de verificação associada que passa.
- [ ] `sddharness/progress/current.md` está vazio ou descreve a sessão ativa (não
      contém lixo de sessões anteriores).

## C3 — O código respeita a arquitetura

- [ ] O código segue a estrutura e princípios de `sddharness/docs/architecture.md`.
- [ ] Convenções de `sddharness/docs/conventions.md` são respeitadas.
- [ ] Não há logs de debug soltos nem TODOs sem contexto.

## C4 — A verificação é real

- [ ] Existe evidência executável conforme `sddharness/docs/verification.md`.
- [ ] O comando de verificação do projeto passa (via `./sddharness/init.sh`).

## C5 — A sessão foi encerrada corretamente

- [ ] Não há arquivos temporários suspeitos fora do `.gitignore`.
- [ ] `sddharness/progress/history.md` tem uma entrada da última sessão fechada.
- [ ] A última feature trabalhada está refletida em seu estado correto.

## C6 — Spec Driven Development

- [ ] Toda feature com `"sdd": true` em estado `spec_ready`,
      `in_progress` ou `done` tem sua pasta `sddharness/specs/<name>/` com os 3
      arquivos: `requirements.md`, `design.md`, `tasks.md`.
- [ ] `requirements.md` usa EARS estrito (ver `sddharness/docs/specs.md`).
- [ ] Toda feature `done` com `"sdd": true` tem todas as suas tasks
      marcadas `[x]` em `tasks.md`.
- [ ] Cada `R<n>` de `requirements.md` está coberto por pelo menos uma
      evidência de verificação concreta.

---

**Como usar este arquivo:** o agente revisor percorre cada checkbox,
marca `[x]` ou `[ ]`, e rejeita o fechamento da sessão se sobrarem boxes
vazios em C1–C6.
