# Arquitetura — O que significa "fazer um bom trabalho"

> Este documento define o padrão de qualidade do **projeto alvo**.
> Os agentes revisores avaliam o código contra este arquivo.
> Se não está aqui, não é um requisito.

## TODO — preencha após instalar o arnês

1. **Stack** — linguagem, runtime, frameworks, banco, deploy.
2. **Layout de pastas** — onde vive o código de aplicação, testes,
   configs e scripts.
3. **Princípios** — camadas, fronteiras, o que é permitido / proibido.
4. **Dependências** — regras para adicionar libs.

## Princípios genéricos (mantenha ou adapte)

1. Mudanças pequenas e rastreáveis a uma feature de `sddharness/feature_list.json`.
2. Contratos públicos estáveis; detalhes internos encapsulados.
3. Sem IO oculto em camadas que deveriam ser puras (se aplicável).
4. Toda dependência nova precisa de justificativa no `design.md` da feature.
