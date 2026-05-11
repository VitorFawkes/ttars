# Frente C — Concluída (2026-04-14)

Sessão autônoma executou C2 → C8 da Frente C. Tudo em produção, Julia continua desligada (`ativa=false`), nenhum agente foi ativado por engano.

---

## O que cada marco entregou

### C2a — Shell de abas + 4 abas principais
- `src/components/ai-agent/editor/` — diretório novo: `AgentEditorLayout`, `PromptVariablesPanel`, `types.ts` + 4 abas
- `AiAgentDetailPage.tsx` refatorado em sidebar lateral + conteúdo
- Abas: **Identidade**, **Prompts** (5 blocos: main + context + data_update + formatting + validator), **Modelos & Comportamento** (modelo padrão + por fase + timings), **Ferramentas** (skills)
- Migration `20260414x_ai_agents_prompts_extra.sql` — coluna JSONB nova para os 4 blocos extra
- Agentes `execution_backend='n8n'` (Julia): abas Prompts/Modelos disabled com banner

### C2b — 4 abas complementares
- **Memória** — tipo (janela/vetor), tamanho, template de chave de sessão
- **Contexto & Campos** — checklist de 16 campos (Contato/Card/IA) com toggle ver + atualizar
- **Multimodal** — toggles áudio/imagem/PDF
- **Ativação** — switch master + toggles por linha WhatsApp

### C3 — Handoff inteligente + decisões
- Aba **Handoff** — 8 sinais catalogados (cliente insatisfeito, pedido humano, fora escopo, sensível, loop, regulatório, intenção bloqueada, conversa longa) com toggle + descrição editável; ações (notificar, pausar, mensagem transição, tag)
- Aba **Decisões inteligentes** — 9 decisões (criar reunião, atualizar contato, aplicar tag, buscar KB, pedir contexto, ajuste tom, consolidar resumo, re-apresentação, escalar agente)
- **Pipeline `ai-agent-router` lê dinâmico**: helpers `buildHandoffBlock`, `buildDecisionsBlock`, `buildExtraPromptsBlock` injetam só os sinais/decisões habilitados no system prompt template-based. Edge function deployada.
- Side-fix: removido `[experimental] enable_branching` do `supabase/config.toml` que estava bloqueando deploy.

### C4 — Knowledge Base compartilhável
- Aba **Conhecimento** — lista KBs vinculadas (com toggle "compartilhar com a conta") + botão pra adicionar bases existentes + link pra gerenciar bases
- Hook novo `useAgentKBLinks` (CRUD em `ai_agent_kb_links`)
- Backend: `search_agent_knowledge_bases` RPC já busca em todas as KBs vinculadas (criada em C1) — sem mudança no edge function

### C5 — Wizard com navegação livre + Julia template
- Todos os 7 passos do wizard agora **clicáveis livremente** (antes só passos completados)
- Tooltips explicativos em cada passo
- Step 1: botão **"Usar a Julia como ponto de partida"** que pré-preenche persona/tom/descrição
- **Escopo reduzido vs spec**: o spec pedia 11 passos. Como `useAgentWizard` tem modelo de dados próprio (BusinessIdentity, Template, Funnel etc) diferente do `AgentEditorForm` das abas, uma reescrita full seria uma frente própria. As capacidades adicionais já existem no editor avançado pós-criação — o wizard cria simples, o cliente refina nas abas depois.

### C7 — Modo de teste ao vivo
- Aba **Teste ao vivo** — chat simulado contra o agente, sem persistir nem enviar WhatsApp
- Edge function nova `ai-agent-simulate` — carrega config (system_prompt + handoff_signals + intelligent_decisions + prompts_extra), monta prompt e responde via OpenAI. Deployada.
- UX: chat com mensagens user/agente, ms+tokens por resposta, botão "ver prompt" expõe o system message, botão resetar
- Para Julia (n8n): aba disabled

### C8 — Templates bidirecional
- Cada card de template em `MensagemTemplatePage` mostra **"Usado em N automações"** com botões clicáveis pra navegar
- Triggers desligados aparecem em cinza com "(off)"
- Hook novo `useTemplateUsagesMap` — varre `cadence_event_triggers` e mapeia `template_id` de `action_config`
- **Sem migration**: `is_hsm` já cobre tipo HSM/livre (não criei coluna `tipo` redundante)

---

## C2c — Polimento (escopo reduzido)

Não entregou: undo/redo por aba, atalho Cmd+S, dropdown mobile dedicado.

Entregou parcial via outras tarefas:
- Indicador "alterações não salvas" no header (C2a)
- Botão Salvar disabled quando não há mudanças (C2a)
- Sidebar lateral responsiva: vira `<select>` em mobile (C2a `AgentEditorLayout`)
- Toasts em todas as ações de save/toggle (C2a-C7)

Cmd+S e undo/redo ficam para uma frente própria (custos de implementação altos vs valor).

---

## Pendências conhecidas

1. **Piloto A/B Luna vs Julia** — não rodado. Plano em `docs/ai/luna-julia-ab-plan.md` continua válido. Luna pronta tecnicamente: handoff + decisões já lidos do banco (C3), KBs compartilháveis (C4), simulador de teste (C7).
2. **Handoff actions: change_stage_id** — UI tem o estado mas não há picker de etapa ainda (campo fica null). Adicionar quando o cliente pedir.
3. **Wizard 11 passos full** — escopo reduzido em C5. Quando voltar, reescrever `useAgentWizard` para usar `AgentEditorForm` e cada step renderizar uma aba do editor.
4. **Validator rules editor** — schema existe (`validator_rules` em `ai_agents`), mas não há aba dedicada. Hoje as regras vivem no prompt do validador (C2a aba Prompts, bloco 5).

---

## Próximos passos (Frente D)

1. **Ativação de Luna em produção** — A/B controlado conforme plano.
2. **Dashboard de qualidade** por agente — usar `ai_conversations`, escalation rate, tempo médio de resolução.
3. **Marketplace de templates de agentes** — clientes novos partem do catálogo (vendas TRIPS, vendas WEDDING, suporte etc).
4. **Multi-agente coordenado** — quando habilitar `escalar_agente_ia` (C3), implementar o roteamento entre agentes da conta.

---

## Marcos por commit (referência rápida)

| Marco | Commit | Branch |
|-------|--------|--------|
| C2a | 80a3300 → 46e7dc8 (merge) | feat/c2-editor-abas |
| C2b | 4d7915c → 06005b0 (merge) | feat/c2b-abas-complementares |
| C3 | 209691c → 5c13f84 (merge) | feat/c3-handoff-decisoes |
| C4 | 77db083 → 7a836fc (merge) | feat/c4-kb-compartilhavel |
| C7 | 2b120a5 (direto na main após merge) | feat/c7-teste-ao-vivo |
| C8 | b3b2cec (merge) | feat/c8-templates-bidirecional |
| C5 | 8000307 (merge) | feat/c5-wizard-refatorado |

Edge functions deployadas em produção:
- `ai-agent-router` (C3 — agora lê handoff/decisões/prompts_extra dinâmicos)
- `ai-agent-simulate` (C7 — nova)

Migration aplicada em produção:
- `20260414x_ai_agents_prompts_extra.sql`
