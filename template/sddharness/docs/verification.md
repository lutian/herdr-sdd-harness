# Verificação — Como demonstrar que o trabalho funciona

> Regra de ouro: **o agente não diz "funciona", ele demonstra**.
> Toda feature termina com evidência executável, não com afirmações.

## TODO — preencha após instalar o arnês

Defina o comando canônico de verificação do projeto, por exemplo:

- `npm test` / `pnpm test` / `bun test`
- `dotnet test`
- `pytest`
- `npx n8nac ...` / script de validate do repositório
- outro runner documentado aqui

O `./sddharness/init.sh` do arnês tenta detectar a stack e rodar o comando certo.
Se a detecção falhar, configure `VERIFY_CMD` em `.sddharness/config.json`
ou exporte `HARNESS_VERIFY_CMD` no ambiente.

## Níveis

### Nível 1 — Testes / checks automatizados (obrigatório)

Toda mudança de comportamento precisa de evidência no runner do projeto.

### Nível 2 — Integração (quando houver IO)

Exercite o módulo real contra recursos temporários ou dublês na borda —
não contra serviços externos reais em CI local do agente.

### Nível 3 — Rastreabilidade SDD (obrigatório se `"sdd": true`)

Cada `R<n>` mapeia para pelo menos uma evidência. Documente em
`sddharness/progress/impl_<name>.md`.

## Antipadrões

- ❌ "Deveria funcionar" sem evidência.
- ❌ Marcar `done` com `./sddharness/init.sh` vermelho.
- ❌ Inventar um runner diferente do documentado aqui.

## Verificação final

```bash
./sddharness/init.sh
```

Se estiver vermelho, não marque `done`. Anote o bloqueio em
`sddharness/progress/current.md`.
