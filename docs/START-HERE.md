# START HERE — mapa do "cérebro" do WelcomeCRM para qualquer agente

> Entrada única. Se você é um agente (ou humano) chegando ao projeto, leia isto primeiro:
> o que existe, quando usar cada coisa. Visual da estrutura: [estrutura-claude-code.html](estrutura-claude-code.html).

## Os 4 lugares de conhecimento (e quando usar cada um)

| Onde | O que é | Quando ler |
|---|---|---|
| **`CLAUDE.md`** (raiz) | Regras invioláveis, protocolos, arquitetura, tom. Carrega sozinho no início. | Sempre — já vem no contexto. Comece pela seção **TOP 5**. |
| **`memory/` + `MEMORY.md`** | Lições de bugs (`feedback_*`), features em progresso (`project_*`), notas por tema. `MEMORY.md` é o índice. | Antes de tocar numa área conhecida — veja o §Índice por Área no `MEMORY.md`. Subagentes: peça via MCP `get_context` (ver abaixo). |
| **`.agent/CODEBASE.md`** | Inventário do código (tabelas, páginas, hooks, componentes), auto-atualizado por `npm run sync:fix`. | Antes de criar algo novo — pra não reinventar. |
| **`docs/`** | SOPs, design system, charters de produto, FAQs, mapeamentos. | Referência por tema (ex.: `SQL_SOP.md`, `DESIGN_SYSTEM.md`, `weddings/CHARTER.md`). |

## Como descobrir contexto rápido (o jeito certo)
1. **Chame o MCP `get_context`** (`mcp__welcomecrm-context__get_context`) com a descrição da task.
   Ele devolve: agente especialista, seções do CODEBASE, arquivos a ler, hooks/tabelas relacionados
   **e as regras relevantes da memória** (`feedback_*`/`project_*`) — inclusive para subagentes.
2. `check_impact` antes de modificar arquivo crítico; `get_dependencies` pra ver quem usa o quê.
3. `grep` pra confirmar usages antes de mudar código existente.

## Regras que mais viram bug (atalho — detalhe na §TOP 5 do CLAUDE.md)
1. Listagens por-org sempre filtram `org_id` (ou RPC `SECURITY DEFINER`).
2. Usuários de workspace via `org_members`, nunca `profiles.org_id`.
3. Hooks de config de pipeline exigem `pipelineId` fora do Pipeline Studio.
4. Migrations: staging primeiro, depois promover; nunca SQL direto.
5. `CREATE OR REPLACE FUNCTION`: grep migrations anteriores antes de recriar.

## Modelo dos agentes
- Principal e **todos os subagentes** rodam **Opus 4.8** (forçado em `.claude/settings.json` →
  `CLAUDE_CODE_SUBAGENT_MODEL`). Não passe `model` nas chamadas Agent. Ver `memory/feedback_subagent_model_opus.md`.

## Rede de segurança (roda sozinha)
- Hooks `PreToolUse` barram vazamento de dados/RLS/arquivos sensíveis; `Stop` confere build+testes.
- CI + E2E (Playwright) + smoke em produção com auto-rollback. Detalhe: `memory/safety-net-e2e.md`.
