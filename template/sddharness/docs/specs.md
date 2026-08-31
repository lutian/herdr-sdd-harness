# Spec Driven Development (SDD)

> Este projeto segue um fluxo estilo Kiro: requirements → design → tasks
> → code. O código não é escrito até que o spec esteja aprovado por um
> humano.

## Estrutura

Cada feature nova (`"sdd": true` em `sddharness/feature_list.json`) tem uma pasta
dedicada assim que sai de `pending`:

```
specs/<feature-name>/
├── requirements.md   # O QUÊ é necessário (notação EARS)
├── design.md         # COMO será construído (decisões técnicas)
└── tasks.md          # PASSOS concretos a implementar
```

O `feature-name` coincide com o campo `name` de `sddharness/feature_list.json`
(ex.: `feature-01`).

## Estados de uma feature

| Estado         | Significado                                                     |
|----------------|-------------------------------------------------------------------|
| `pending`      | Sem spec. O `spec_author` é o primeiro a agir.                   |
| `spec_ready`   | Spec redigido. Aguardando aprovação humana. NÃO se toca código.  |
| `in_progress`  | Spec aprovado. `implementer` trabalhando.                        |
| `done`         | Verificação verde, `reviewer` aprovou, sessão fechada.           |
| `blocked`      | Travado. Motivo em `sddharness/progress/current.md`.                        |

## O portão de aprovação humana

Quando o `spec_author` termina, marca `spec_ready` e para. O humano lê
`sddharness/specs/<feature>/` e roda:

```
/sddharness approve <feature-XX>
```

Só então o `leader` transiciona `spec_ready → in_progress` e lança o
`implementer`.

```
pending → [spec_author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → done
```

## requirements.md — EARS estrito

| Padrão          | Modelo                                                        |
|------------------|-------------------------------------------------------------------|
| **Ubíquo**       | `O sistema DEVE <ação>.`                                          |
| **Evento**       | `QUANDO <gatilho>, o sistema DEVE <ação>.`                        |
| **Estado**       | `ENQUANTO <estado>, o sistema DEVE <ação>.`                       |
| **Opcional**     | `ONDE <feature opcional>, o sistema DEVE <ação>.`                 |
| **Indesejado**   | `SE <evento indesejado> ENTÃO o sistema DEVE <ação>.`             |

Regras rígidas:

- Cada requirement tem id estável: `R1`, `R2`, ...
- Cada requirement DEVE ser verificável conforme `sddharness/docs/verification.md`.
- Um `DEVE` por requirement.
- Sem verbos brandos ("poderia", "pode", "suporta").

## design.md — decisões técnicas

Capture antes de tocar em código: arquivos, assinaturas, exceções,
alternativa descartada. Apoie-se em `sddharness/docs/architecture.md` e
`sddharness/docs/conventions.md`.

## tasks.md — checklist executável

Passos discretos com `[ ]`, cada um referenciando `R<n>`. O implementer
marca `[x]`; o reviewer rejeita `[ ]` sem justificativa.

## Rastreabilidade

Cada `R<n>` precisa de evidência de verificação. O mapa fica em
`sddharness/progress/impl_<name>.md`.

## Quando o SDD NÃO se aplica

Features com `"sdd": false` ou sem o campo `sdd` NÃO têm spec.
