---
name: Travel Planner Redesign
description: Decisões, estado atual e gotchas do redesign greenfield do Travel Planner (Welcome Trips)
type: project
---

## Status

- **Marco 1 (Fundação):** Aplicado no staging (2026-04-16). Pronto para promoção a produção.
- **Marco 2–5:** Pendente

## Doc Master

`docs/revisao-propostas-viagem.md` — ler ANTES de qualquer implementação.

## Schema criado (Marco 1)

### Tabelas
- `viagens` — entidade central, 1:1 com card, public_token para acesso anônimo
- `trip_items` — itens da viagem (hotel, voo, dia, etc), hierarquia via parent_id
- `trip_item_history` — audit granular por campo (não snapshot)
- `trip_comments` — thread por item ou viagem, com flag interno
- `trip_events` — timeline de tracking (aberta, item_aprovado, etc)
- `trip_library_items` — biblioteca reutilizável do workspace

### ENUMs
- `viagem_estado`: desenho → em_recomendacao → em_aprovacao → confirmada → em_montagem → aguardando_embarque → em_andamento → pos_viagem → concluida
- `trip_item_tipo`: dia, hotel, voo, transfer, passeio, refeicao, seguro, dica, voucher, contato, texto, checklist
- `trip_item_status`: rascunho → proposto → aprovado|recusado → operacional → vivido → arquivado

### Triggers
- FK cross-org guards em todas as tabelas (padrão canônico do cadence_steps)
- Totalização: `trip_items.comercial->>'preco'` → `viagens.total_estimado/total_aprovado`
- Audit: AFTER UPDATE em trip_items → trip_item_history (por campo: comercial, operacional, alternativas, status)
- State machine: validação de transições de `trip_item_status`
- Sync: `cards.pipeline_stage_id` → `viagens.estado` (pós-aceite, mapeamento hardcoded de stage UUIDs)

### RPCs públicas (SECURITY DEFINER, acesso anon)
- `get_viagem_by_token(p_token)` — leitura completa, auto-transição em_recomendacao→em_aprovacao
- `aprovar_item(p_token, p_item_id)` — cliente aprova item proposto
- `escolher_alternativa(p_token, p_item_id, p_alternativa_id)` — cliente escolhe entre opções
- `comentar_item(p_token, p_item_id, p_texto)` — p_item_id nullable = viagem inteira
- `confirmar_viagem(p_token)` — handoff TP→PV, aprova todos itens propostos

## Gotchas conhecidas

1. **Staging defasado:** `cards.org_id` não existe no staging → trigger cross-org de viagens falha lá. Funciona em produção.
2. **public_token:** Gerado como `encode(gen_random_bytes(18), 'base64')` — contém `+` e `/`. Para URL, o frontend deve usar `encodeURIComponent()`.
3. **Preço em JSONB:** `comercial->>'preco'` — se preco não existir, trigger totaliza como 0 (COALESCE). App DEVE validar que preco é numérico.
4. **Estado pós-aceite:** Derivado de `cards.pipeline_stage_id` via trigger. NÃO atualizar viagens.estado diretamente para estados pós-confirmada.

## Migrations

1. `20260416_m1_001_travel_planner_enums.sql`
2. `20260416_m1_002_travel_planner_tables.sql`
3. `20260416_m1_003_travel_planner_triggers.sql`
4. `20260416_m1_004_travel_planner_rpcs.sql`
