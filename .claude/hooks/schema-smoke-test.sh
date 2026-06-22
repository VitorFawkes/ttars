#!/bin/bash
set -euo pipefail

# Schema Smoke Test — verifica que queries críticas do frontend funcionam no banco
# Pode ser chamado contra staging ou produção via env vars:
#   SMOKE_URL, SMOKE_ANON, SMOKE_KEY (override)
#   Ou usa VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY do .env

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../.." || exit 1
source .env 2>/dev/null || true

URL="${SMOKE_URL:-$VITE_SUPABASE_URL}"
ANON="${SMOKE_ANON:-$VITE_SUPABASE_ANON_KEY}"
KEY="${SMOKE_KEY:-$SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "SKIP: variáveis de ambiente não disponíveis"
  exit 0
fi

# Detectar se estamos testando contra staging (banco incompleto)
STAGING_MODE=false
if [ -n "${SMOKE_URL:-}" ]; then
  STAGING_MODE=true
fi

FAILED=0
TOTAL=0

test_query() {
  local name="$1"
  local endpoint="$2"
  TOTAL=$((TOTAL + 1))
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    "${URL}/rest/v1/${endpoint}" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    --max-time 10)

  if [ "$status" != "200" ] && [ "$status" != "206" ]; then
    echo "  FAIL: $name → HTTP $status" >&2
    FAILED=$((FAILED + 1))
  fi
}

# ── H2: organizations + products ──

test_query "organizations table" \
  "organizations?select=id,name,slug&limit=1"

test_query "products table" \
  "products?select=id,slug,name,pipeline_id,active&limit=1"

# ── Queries que o frontend FAZ (extraídas do código) ──
# Staging pode não ter todas as tabelas/views — pular queries não-essenciais

if [ "$STAGING_MODE" = "false" ]; then

# Pipeline (usePipelineCards.ts + usePipelineListCards.ts)
test_query "view_cards_acoes (colunas críticas)" \
  "view_cards_acoes?select=id,titulo,archived_at,is_group_parent,parent_card_id,anexos_count,pessoa_telefone_normalizado,concierge_nome&limit=1"

# Concierge: view com colunas root_* para espelhar atendimentos de sub-card no principal
# (20260507a) — frontend agrupa kanban /concierge por root_card_id e usa is_from_sub_card
# para renderizar badge no card detail principal.
test_query "v_meu_dia_concierge (root_card_id + is_from_sub_card)" \
  "v_meu_dia_concierge?select=tarefa_id,card_id,root_card_id,root_card_titulo,root_pessoa_principal_nome,is_from_sub_card&limit=1"

# Dashboard (StatsCards.tsx + FunnelChart.tsx)
test_query "view_dashboard_funil" \
  "view_dashboard_funil?select=etapa_nome,total_cards,etapa_ordem,produto&limit=1"

# Dashboard atividades (RecentActivity.tsx)
test_query "activities + joins" \
  "activities?select=id,tipo,descricao,created_at,card:cards!card_id(titulo),created_by_user:profiles!created_by(nome,email)&limit=1"

# Task sync (tarefas.external_id + integration_task_type_map)
test_query "tarefas external_id columns" \
  "tarefas?select=id,external_id,external_source&limit=1"

test_query "integration_task_type_map" \
  "integration_task_type_map?select=id,ac_task_type,crm_task_tipo&limit=1"

test_query "integration_task_sync_config" \
  "integration_task_sync_config?select=id,inbound_enabled,outbound_enabled&limit=1"

fi  # end production-only queries

# Queries que existem em AMBOS os ambientes
# Pipeline stages (usePipelineStages.ts)
test_query "pipeline_stages + phases join" \
  "pipeline_stages?select=*,pipeline_phases!pipeline_stages_phase_id_fkey(order_index)&limit=1"

# Stage section config (useStageSectionConfig.ts)
test_query "stage_section_config" \
  "stage_section_config?select=id,stage_id,section_key,is_visible&limit=1"

# Section field config — defaults de campos por seção (useSectionFieldConfig.ts)
test_query "section_field_config" \
  "section_field_config?select=id,section_key,field_key,is_visible,is_required&limit=1"

# Dashboard reuniões (TodayMeetingsWidget.tsx)
test_query "tarefas (deleted_at + reunião)" \
  "tarefas?select=id,titulo,data_vencimento,deleted_at,tipo,concluida&limit=1"

# Gifts custom image (20260525a) — frontend lê custom_image_path no GiftItemRow
# para renderizar foto de item avulso. Sem a coluna, items.* falha em INSERT.
test_query "card_gift_items.custom_image_path column" \
  "card_gift_items?select=id,custom_image_path&limit=1"

# ── Assessoria VIP integration (20260526m) ──
# Frontend e edge function leem essas tabelas; sem elas, /admin/integracoes/assessoria-vip
# e a aba do card quebram.
test_query "avip_connections_safe (view sanitizada)" \
  "avip_connections_safe?select=id,org_id,email,status,last_synced_at&limit=1"

test_query "avip_event_links" \
  "avip_event_links?select=id,card_id,avip_event_id,match_method,match_confidence&limit=1"

test_query "avip_unmatched_events" \
  "avip_unmatched_events?select=id,avip_event_id,avip_event_name,dismissed&limit=1"

test_query "avip_sync_log (últimos)" \
  "avip_sync_log?select=id,started_at,finished_at,guests_inserted&limit=1"

test_query "wedding_guests source column (20260526m)" \
  "wedding_guests?select=id,source,avip_guest_id,avip_synced_at&limit=1"

# ── Lista de Convidados (20260527m+j+k+l) ──
test_query "wedding_casais (lista convidados)" \
  "wedding_casais?select=id,codigo,nome_casal,whatsapp_digits,card_id&limit=1"

test_query "wedding_convites (agrupamento)" \
  "wedding_convites?select=id,casal_id,nome,posicao&limit=1"

test_query "wedding_guests campos novos (convite_id, faixa, lado, tipo)" \
  "wedding_guests?select=id,convite_id,casal_id,faixa,lado,tipo,nome_raw,telefone_raw&limit=1"

test_query "v_wedding_guests_resolved (view)" \
  "v_wedding_guests_resolved?select=id,nome_display,telefone_display,convite_nome&limit=1"

# ── Extras de convidados (20260527o) — kanban de venda adicional ──
test_query "wedding_guest_extras table" \
  "wedding_guest_extras?select=id,guest_id,card_id,org_id,status,itens&limit=1"

test_query "v_wedding_guest_extras (view do kanban de extras)" \
  "v_wedding_guest_extras?select=guest_id,card_id,org_id,nome,casamento_nome,extras_status,itens,extras_id&limit=1"

# ── Hotel unificado por casamento (20260616b) ──
# Fonte única lida por Convidados (HotelSection/HotelBar) e Planejamento via
# useWeddingHotel. 1:1 com o card (PK card_id). Per-org (trigger strict).
test_query "wedding_hotel table" \
  "wedding_hotel?select=card_id,org_id,nome,categoria,check_in,check_out,total_quartos,quartos_reservados,status&limit=1"

# ── RPCs críticas (chamadas via rpc/) ──

test_rpc() {
  local name="$1"
  local rpc_name="$2"
  local body="$3"
  TOTAL=$((TOTAL + 1))
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    "${URL}/rest/v1/rpc/${rpc_name}" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d "${body}" \
    --max-time 15)

  if [ "$status" != "200" ] && [ "$status" != "206" ]; then
    echo "  FAIL: $name → HTTP $status" >&2
    FAILED=$((FAILED + 1))
  fi
}

if [ "$STAGING_MODE" = "false" ]; then

# ── Contato Principal swap (cards_contatos unique constraint) ──
test_query "cards_contatos table" \
  "cards_contatos?select=id,card_id,contato_id&limit=1"

# ── WhatsApp Groups ──
test_query "whatsapp_groups table" \
  "whatsapp_groups?select=id,group_jid,card_id&limit=1"

test_query "whatsapp_messages group cols" \
  "whatsapp_messages?select=id,is_group,group_jid,group_name&limit=1"

# RPCs críticas — testar com params corretos (leves, rápidas)
test_rpc "analytics_pipeline_current" "analytics_pipeline_current" \
  '{"p_product":"TRIPS"}'

fi  # end production-only

# RPCs de ganho/perdido — verificar que existem (aceitar qualquer status != 404)
test_rpc_exists() {
  local name="$1"
  local rpc_name="$2"
  local body="$3"
  TOTAL=$((TOTAL + 1))
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    "${URL}/rest/v1/rpc/${rpc_name}" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d "${body}" \
    --max-time 15)

  if [ "$status" = "404" ]; then
    echo "  FAIL: $name → RPC não existe (HTTP 404)" >&2
    FAILED=$((FAILED + 1))
  fi
}

test_rpc_exists "marcar_ganho RPC exists" "marcar_ganho" \
  '{"p_card_id":"00000000-0000-0000-0000-000000000000"}'

# AVip integration: função de match (20260526m)
test_rpc_exists "find_avip_candidate_cards RPC exists" "find_avip_candidate_cards" \
  '{"p_org_id":"00000000-0000-0000-0000-000000000000","p_avip_event_name":"x","p_avip_event_date":"2026-01-01"}'

test_rpc_exists "marcar_perdido RPC exists" "marcar_perdido" \
  '{"p_card_id":"00000000-0000-0000-0000-000000000000"}'

test_rpc_exists "reabrir_card RPC exists" "reabrir_card" \
  '{"p_card_id":"00000000-0000-0000-0000-000000000000"}'

# Funil de pré-venda (SDR) por período (20260622a) — tela /analytics/sdr
test_rpc_exists "analytics_sdr_funil_periodo RPC exists" "analytics_sdr_funil_periodo" \
  '{"p_product":"TRIPS"}'

test_rpc_exists "analytics_sdr_funil_periodo_cards RPC exists" "analytics_sdr_funil_periodo_cards" \
  '{"p_metric":"agendaram","p_product":"TRIPS"}'

# ── H3: Multi-tenant org_id columns ──

test_query "cards.org_id column" \
  "cards?select=id,org_id&limit=1"

test_query "contatos.org_id column" \
  "contatos?select=id,org_id&limit=1"

test_query "pipelines.org_id column" \
  "pipelines?select=id,org_id,produto&limit=1"

test_query "pipeline_stages.org_id column" \
  "pipeline_stages?select=id,org_id&limit=1"

test_query "teams.org_id column" \
  "teams?select=id,org_id&limit=1"

test_query "profiles.org_id column" \
  "profiles?select=id,org_id&limit=1"

test_query "view_cards_acoes.org_id column" \
  "view_cards_acoes?select=id,org_id&limit=1"

test_query "requesting_org_id function exists" \
  "rpc/requesting_org_id"

# ── Sprint C: cross-org integrity em cadence_event_triggers ──
# Cobre target_template_id, target_stage_id, tag_id, applicable_pipeline_ids,
# e task_configs[].assign_to_user_id. Ver 20260420c_sprint_c_*.sql.
if [ "$STAGING_MODE" = "false" ]; then
  TOTAL=$((TOTAL + 1))
  CROSS_ORG=$(curl -s \
    -X POST \
    "${URL}/rest/v1/rpc/cadence_triggers_cross_org_count" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 10)

  if [ -z "$CROSS_ORG" ] || ! echo "$CROSS_ORG" | grep -qE '^[0-9]+$'; then
    echo "  FAIL: cadence_triggers_cross_org_count → resposta inesperada: $CROSS_ORG" >&2
    FAILED=$((FAILED + 1))
  elif [ "$CROSS_ORG" != "0" ]; then
    echo "  FAIL: $CROSS_ORG cadence_event_triggers com FK cross-org — rodar auditoria" >&2
    FAILED=$((FAILED + 1))
  fi

  # ── Account/Workspace isolation: slugs duplicados em pipeline_phases ──
  # Conta linhas em pipeline_phases que colidem por slug dentro da mesma
  # família hierárquica (account + workspaces filhos). Esperado: 0 após a
  # limpeza do Balde (ii) do plano de separação account/workspace. Enquanto
  # Welcome Group tiver resíduos de pipeline_phases, este teste emite WARN —
  # vira FAIL quando a limpeza terminar.
  TOTAL=$((TOTAL + 1))
  DUP_SLUGS=$(curl -s \
    -X POST \
    "${URL}/rest/v1/rpc/pipeline_phases_duplicate_slugs_count" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 10)

  if [ -z "$DUP_SLUGS" ] || ! echo "$DUP_SLUGS" | grep -qE '^[0-9]+$'; then
    echo "  FAIL: pipeline_phases_duplicate_slugs_count → resposta inesperada: $DUP_SLUGS" >&2
    FAILED=$((FAILED + 1))
  elif [ "$DUP_SLUGS" != "0" ]; then
    echo "  WARN: $DUP_SLUGS pipeline_phases com slug duplicado dentro da mesma família de account — rodar limpeza Balde (ii)" >&2
  fi

  # ── Extras de convidados: org_id/card_id divergente do guest pai (20260527o) ──
  # Trigger trg_wge_set_org força org_id e card_id = do guest. Esperado: 0.
  TOTAL=$((TOTAL + 1))
  WGE_CROSS=$(curl -s \
    -X POST \
    "${URL}/rest/v1/rpc/wedding_guest_extras_cross_org_count" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 10)

  if [ -z "$WGE_CROSS" ] || ! echo "$WGE_CROSS" | grep -qE '^[0-9]+$'; then
    echo "  FAIL: wedding_guest_extras_cross_org_count → resposta inesperada: $WGE_CROSS" >&2
    FAILED=$((FAILED + 1))
  elif [ "$WGE_CROSS" != "0" ]; then
    echo "  FAIL: $WGE_CROSS wedding_guest_extras com org/card divergente do guest pai" >&2
    FAILED=$((FAILED + 1))
  fi

  # ── Tarefas duplicadas de cadência ──
  # Conta grupos (card, step, instance) com 2+ tarefas ativas. Esperado: 0
  # após a migration 20260506h. Se subir, regressão na prevenção (índice
  # caiu, ou cadence-engine voltou a inserir sem idempotência).
  TOTAL=$((TOTAL + 1))
  CADENCE_DUPS=$(curl -s \
    -X POST \
    "${URL}/rest/v1/rpc/cadence_tarefas_duplicates_count" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 10)

  if [ -z "$CADENCE_DUPS" ] || ! echo "$CADENCE_DUPS" | grep -qE '^[0-9]+$'; then
    echo "  FAIL: cadence_tarefas_duplicates_count → resposta inesperada: $CADENCE_DUPS" >&2
    FAILED=$((FAILED + 1))
  elif [ "$CADENCE_DUPS" != "0" ]; then
    echo "  FAIL: $CADENCE_DUPS grupos de tarefas de cadência com duplicatas ativas — verificar índice tarefas_unique_cadence_step" >&2
    FAILED=$((FAILED + 1))
  fi

  # ── Isolamento das filas de cadência por workspace (20260602) ──
  # Conta linhas em cadence_queue com org_id divergente da instância +
  # cadence_instances com org_id divergente do card. Esperado: 0 (triggers
  # auto_set_cadence_queue_org_id / auto_set_cadence_instances_org_id forçam).
  TOTAL=$((TOTAL + 1))
  CADENCE_QUEUE_CROSS=$(curl -s \
    -X POST \
    "${URL}/rest/v1/rpc/cadence_queue_cross_org_count" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 10)

  if [ -z "$CADENCE_QUEUE_CROSS" ] || ! echo "$CADENCE_QUEUE_CROSS" | grep -qE '^[0-9]+$'; then
    echo "  FAIL: cadence_queue_cross_org_count → resposta inesperada: $CADENCE_QUEUE_CROSS" >&2
    FAILED=$((FAILED + 1))
  elif [ "$CADENCE_QUEUE_CROSS" != "0" ]; then
    echo "  FAIL: $CADENCE_QUEUE_CROSS linhas de fila/instância de cadência com org_id divergente do pai" >&2
    FAILED=$((FAILED + 1))
  fi

  # ── Hierarquia de cards (parent_card_id) consistente ──
  # Conta cards onde parent.org_id != child.org_id, ou produto/pipeline divergente,
  # ou pai é sub_card. Esperado: 0 após migration 20260507a (trigger fn_validate_parent_card_link).
  # Se subir, regressão na validação ou alguma RPC nova escrevendo parent_card_id sem checagem.
  TOTAL=$((TOTAL + 1))
  CARD_HIER=$(curl -s \
    -X POST \
    "${URL}/rest/v1/rpc/cards_hierarchy_violation_count" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 10)

  if [ -z "$CARD_HIER" ] || ! echo "$CARD_HIER" | grep -qE '^[0-9]+$'; then
    echo "  FAIL: cards_hierarchy_violation_count → resposta inesperada: $CARD_HIER" >&2
    FAILED=$((FAILED + 1))
  elif [ "$CARD_HIER" != "0" ]; then
    echo "  FAIL: $CARD_HIER cards com hierarquia inconsistente — checar trigger trg_validate_parent_card_link e RPCs que escrevem parent_card_id" >&2
    FAILED=$((FAILED + 1))
  fi

  # ── Triggers card_created com filtro de etapa em campo legado ──
  # Editor V2 antigo gravava filtro em event_config.initial_stage_id em vez
  # da coluna applicable_stage_ids — dispatcher SQL ignorava o filtro e a
  # automacao disparava pra todos os cards novos. Migration 20260512m
  # backfilla e instala trigger BEFORE INSERT/UPDATE pra auto-migrar.
  # Esperado: 0. Se subir, regressao no save do editor (persistence.ts) ou
  # bypass do trigger SQL.
  TOTAL=$((TOTAL + 1))
  LEGACY_TRIGGER=$(curl -s \
    -X POST \
    "${URL}/rest/v1/rpc/cadence_triggers_legacy_card_created_count" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 10)

  if [ -z "$LEGACY_TRIGGER" ] || ! echo "$LEGACY_TRIGGER" | grep -qE '^[0-9]+$'; then
    echo "  FAIL: cadence_triggers_legacy_card_created_count → resposta inesperada: $LEGACY_TRIGGER" >&2
    FAILED=$((FAILED + 1))
  elif [ "$LEGACY_TRIGGER" != "0" ]; then
    echo "  FAIL: $LEGACY_TRIGGER triggers card_created com filtro de etapa em campo legado — auto-heal SQL deveria ter migrado" >&2
    FAILED=$((FAILED + 1))
  fi

  # ── Itens Monde "zumbi": agregado pré-04-01 coexistindo com granular pós-04-01 da mesma venda ──
  # Esperado: 0 após cleanup retroativo (20260507e). Se subir, importador parou de
  # aplicar a regra "último arquivo vence" — ver migration 20260506f e callers em
  # supabase/functions/integration-process e integration-sync-deals.
  TOTAL=$((TOTAL + 1))
  ZUMBI=$(curl -s \
    -X POST \
    "${URL}/rest/v1/rpc/count_monde_zombie_items" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 10)

  if [ -z "$ZUMBI" ] || ! echo "$ZUMBI" | grep -qE '^[0-9]+$'; then
    echo "  FAIL: count_monde_zombie_items → resposta inesperada: $ZUMBI" >&2
    FAILED=$((FAILED + 1))
  elif [ "$ZUMBI" != "0" ]; then
    echo "  FAIL: $ZUMBI cards com itens Monde zumbi (mesma venda re-importada com conteúdo diferente, mas linhas antigas não foram arquivadas) — rodar cleanup retroativo" >&2
    FAILED=$((FAILED + 1))
  fi

  # ── Items Monde em cards arquivados (regra absoluta: card arquivado = inexistente) ──
  # Esperado: 0 sempre. Trigger BEFORE INSERT/UPDATE em card_financial_items
  # (20260519c) + cascata trg_propagate_card_archived (20260515e) impedem.
  # Se subir, há um caminho que está bypassando a guarda — investigar.
  TOTAL=$((TOTAL + 1))
  ARCHIVED_LEAK=$(curl -s \
    -X POST \
    "${URL}/rest/v1/rpc/monde_items_in_archived_cards_count" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 10)

  if [ -z "$ARCHIVED_LEAK" ] || ! echo "$ARCHIVED_LEAK" | grep -qE '^[0-9]+$'; then
    echo "  FAIL: monde_items_in_archived_cards_count → resposta inesperada: $ARCHIVED_LEAK" >&2
    FAILED=$((FAILED + 1))
  elif [ "$ARCHIVED_LEAK" != "0" ]; then
    echo "  FAIL: $ARCHIVED_LEAK items financeiros ativos em cards arquivados — guarda BEFORE INSERT/UPDATE foi furada" >&2
    FAILED=$((FAILED + 1))
  fi

  # ── Reconcile: divergência entre card_financial_items e arquivo Monde ──
  # Esperado: 0 após backfill (20260519d). Casos legacy (pending_sale ausente)
  # não contam. Se subir, algum caminho de criação/atualização não passou pelo
  # reconcile_card_monde_venda — investigar ImportacaoPosVendaPage ou outra rota.
  TOTAL=$((TOTAL + 1))
  RECONCILE_DIV=$(curl -s \
    -X POST \
    "${URL}/rest/v1/rpc/monde_reconcile_divergence_count" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 10)

  if [ -z "$RECONCILE_DIV" ] || ! echo "$RECONCILE_DIV" | grep -qE '^[0-9]+$'; then
    echo "  FAIL: monde_reconcile_divergence_count → resposta inesperada: $RECONCILE_DIV" >&2
    FAILED=$((FAILED + 1))
  elif [ "$RECONCILE_DIV" != "0" ]; then
    echo "  WARN: $RECONCILE_DIV pares (card, venda) divergem do arquivo Monde — chamar reconcile_card_monde_venda" >&2
  fi
fi

# ── NPS feature (nps_surveys + nps_responses) ──
# Tabelas criadas em 20260516b_create_nps_tables.sql. Aba /nps no sidebar
# depende destas tabelas para listar pesquisas enviadas e respostas recebidas.
NPS_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  "${URL}/rest/v1/nps_surveys?select=id&limit=1" \
  -H "apikey: ${ANON}" \
  -H "Authorization: Bearer ${KEY}" \
  --max-time 10)

if [ "$NPS_CHECK" = "200" ] || [ "$NPS_CHECK" = "206" ]; then
  test_query "nps_surveys table" \
    "nps_surveys?select=id,org_id,card_id,contact_id,channel,token,sent_at&limit=1"

  test_query "nps_responses table" \
    "nps_responses?select=id,survey_id,org_id,card_id,score,comment,responded_at&limit=1"
fi

# ── A1: Card Alert Rules — canais e destinatários (Marco A.1, 20260520a) ──
# Detectar se as colunas de canais foram adicionadas
ALERT_RULES_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  "${URL}/rest/v1/card_alert_rules?select=show_in_modal&limit=1" \
  -H "apikey: ${ANON}" \
  -H "Authorization: Bearer ${KEY}" \
  --max-time 10)

if [ "$ALERT_RULES_CHECK" = "200" ] || [ "$ALERT_RULES_CHECK" = "206" ]; then
  test_query "card_alert_rules.show_in_modal column" \
    "card_alert_rules?select=id,show_in_modal,show_in_kanban_banner,show_in_bell&limit=1"

  test_query "card_alert_rules.recipient_mode column" \
    "card_alert_rules?select=id,recipient_mode,recipient_target&limit=1"

  # ── A2: resolve_alert_recipients RPC (Marco A.2, 20260520c) ──
  test_rpc "resolve_alert_recipients RPC" \
    "resolve_alert_recipients" \
    '{"p_rule_id":"00000000-0000-0000-0000-000000000000","p_card_id":"00000000-0000-0000-0000-000000000000"}'
fi

# ── M1: Travel Planner tables (só após promoção para produção) ──
# Detectar se viagens existe antes de testar todo o grupo
VIAGENS_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  "${URL}/rest/v1/viagens?select=id&limit=1" \
  -H "apikey: ${ANON}" \
  -H "Authorization: Bearer ${KEY}" \
  --max-time 10)

if [ "$VIAGENS_CHECK" = "200" ] || [ "$VIAGENS_CHECK" = "206" ]; then
  test_query "viagens table" \
    "viagens?select=id,card_id,estado,public_token,total_estimado&limit=1"

  test_query "trip_items table" \
    "trip_items?select=id,viagem_id,tipo,status,ordem&limit=1"

  test_query "trip_comments table" \
    "trip_comments?select=id,viagem_id,autor,texto&limit=1"

  test_query "trip_events table" \
    "trip_events?select=id,viagem_id,tipo&limit=1"

  test_query "trip_item_history table" \
    "trip_item_history?select=id,item_id,campo&limit=1"

  test_query "trip_library_items table" \
    "trip_library_items?select=id,tipo,titulo&limit=1"

  # RPCs públicas do Travel Planner
  test_rpc_exists "get_viagem_by_token RPC exists" "get_viagem_by_token" \
    '{"p_token":"__nonexistent__"}'

  test_rpc_exists "confirmar_viagem RPC exists" "confirmar_viagem" \
    '{"p_token":"__nonexistent__"}'

  # Cancelamento de viagem pós-aceite
  test_query "motivos_cancelamento table" \
    "motivos_cancelamento?select=id,nome,escopo,ativo&limit=1"

  test_query "viagens cancelamento columns" \
    "viagens?select=id,modo_cancelamento,motivo_cancelamento_id,cancelamento_aberto_em,cancelamento_concluido_em,cancelamento_stage_anterior_id&limit=1"

  test_query "trip_items cancelado columns" \
    "trip_items?select=id,cancelado_em,cancelado_por,cancelado_motivo&limit=1"

  test_query "pipeline_stages is_terminal column" \
    "pipeline_stages?select=id,nome,is_terminal&limit=1"

  test_query "stage Cancelada existe no pipeline Trips" \
    "pipeline_stages?nome=eq.Cancelada&is_terminal=eq.true&select=id"

  # RPCs de cancelamento
  test_rpc_exists "abrir_cancelamento RPC exists" "abrir_cancelamento" \
    '{"p_viagem_id":"00000000-0000-0000-0000-000000000000","p_modo":"parcial"}'

  test_rpc_exists "concluir_cancelamento RPC exists" "concluir_cancelamento" \
    '{"p_viagem_id":"00000000-0000-0000-0000-000000000000"}'

  test_rpc_exists "reabrir_cancelamento RPC exists" "reabrir_cancelamento" \
    '{"p_viagem_id":"00000000-0000-0000-0000-000000000000"}'

  test_rpc_exists "cancelar_item_viagem RPC exists" "cancelar_item_viagem" \
    '{"p_item_id":"00000000-0000-0000-0000-000000000000"}'

  test_rpc_exists "descancelar_item_viagem RPC exists" "descancelar_item_viagem" \
    '{"p_item_id":"00000000-0000-0000-0000-000000000000"}'
fi

# ── Analytics: lente temporal (cohort↔atividade) — guarda contra rebase que dropa p_date_ref ──
# Se uma migration futura recriar a função sem p_date_ref, a chamada com esse param vira 404.
test_rpc_exists "analytics_resumo_overview aceita p_date_ref" "analytics_resumo_overview" \
  '{"p_date_start":"2026-01-01T00:00:00Z","p_date_end":"2026-02-01T00:00:00Z","p_product":"TRIPS","p_date_ref":"created"}'
test_rpc_exists "analytics_financeiro_overview aceita p_date_ref" "analytics_financeiro_overview" \
  '{"p_date_start":"2026-01-01T00:00:00Z","p_date_end":"2026-02-01T00:00:00Z","p_product":"TRIPS","p_date_ref":"created"}'

# ── WW: painel não pode conter lead WelConnect (migration 20260612b) ──
# Se uma migration recriar refresh_ww_funil_casal sem a CTE ww_contacts (evidência
# WW), os 351 contatos de esteiras não-Weddings (WelConnect 37, Trips 6/8...) voltam.
TOTAL=$((TOTAL + 1))
WC_LEAK=$(curl -s "${URL}/rest/v1/ww_funil_casal?deal_title=ilike.WC*&select=contact_id&limit=1" \
  -H "apikey: ${ANON}" -H "Authorization: Bearer ${KEY}" --max-time 10)
if [ "$WC_LEAK" != "[]" ]; then
  echo "  FAIL: ww_funil_casal contém lead WelConnect (título WC*) — refresh perdeu o filtro de evidência WW (20260612b)" >&2
  FAILED=$((FAILED + 1))
fi

if [ $FAILED -gt 0 ]; then
  echo "" >&2
  echo "$FAILED/$TOTAL queries falharam. O banco não tem as colunas que o frontend espera." >&2
  exit 1
fi

echo "Schema OK: $TOTAL/$TOTAL queries passaram"
exit 0
