---
name: AI Agent Interaction Modes
description: Decisoes de arquitetura para modos inbound/outbound/hybrid de agentes IA, fila outbound, qualificacao inteligente
type: project
---

## Decisao (2026-04-16)

Agentes IA agora suportam 3 modos de interacao:
- **inbound** (default) — so responde quando cliente manda mensagem
- **outbound** — agente inicia conversa via trigger (card criado com telefone + form)
- **hybrid** — ambos

## Schema

- `ai_agents.interaction_mode` TEXT (inbound|outbound|hybrid)
- `ai_agents.first_message_config` JSONB — tipo fixed (template) ou ai_generated (instrucoes p/ LLM)
- `ai_agents.outbound_trigger_config` JSONB — triggers + business_hours + max_daily_outbound
- `ai_outbound_queue` — fila de envios outbound com retry e business hours
- `ai_agent_qualification_flow.maps_to_field` TEXT — campo CRM que a pergunta mapeia
- `ai_agent_qualification_flow.skip_if_filled` BOOLEAN — pula se campo ja tem valor
- Trigger `trg_card_outbound_queue` — auto-enfileira quando card criado com telefone + origem de form

## Edge Functions

- `ai-agent-outbound-trigger` — processa fila outbound (invocar via cron 30-60s)
- `ai-agent-router` — agora tem qualificacao inteligente (pula perguntas cujo campo ja foi preenchido via form_data)

## Frontend

- `InteractionModeSelector` — componente novo em Step1 do wizard
- `QualificationTimeline` — agora tem maps_to_field + skip_if_filled por etapa
- Step7 — checklist verifica first_message_config + warning WhatsApp oficial para outbound

**Why:** Welcome Trips quer que o agente IA inicie conversa quando lead preenche formulario no site. Ate agora o agente era 100% reativo.

**How to apply:** Ao mexer em ai_agents, wizard, ou router, considerar que existem 3 modos. Ao criar queries para ai_agents, incluir interaction_mode nos filtros se relevante.
