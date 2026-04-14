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

test_rpc_exists "marcar_perdido RPC exists" "marcar_perdido" \
  '{"p_card_id":"00000000-0000-0000-0000-000000000000"}'

test_rpc_exists "reabrir_card RPC exists" "reabrir_card" \
  '{"p_card_id":"00000000-0000-0000-0000-000000000000"}'

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

# ── H3-035: cross-org integrity entre cadence_event_triggers e cadence_templates ──
# Trigger + template devem morar na mesma org. Ver 20260414l_cadence_event_triggers_strict_template_org.sql.
if [ "$STAGING_MODE" = "false" ]; then
  TOTAL=$((TOTAL + 1))
  MISALIGNED=$(curl -s \
    "${URL}/rest/v1/cadence_event_triggers?select=id,org_id,target_template_id,cadence_templates!cadence_event_triggers_target_template_id_fkey(org_id)&target_template_id=not.is.null" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    --max-time 10 \
    | python3 -c "import sys,json
try:
  d=json.load(sys.stdin)
  bad=[r for r in d if isinstance(r,dict) and r.get('cadence_templates') and r['org_id']!=r['cadence_templates']['org_id']]
  print(len(bad))
except Exception:
  print('ERR')" 2>/dev/null)

  if [ "$MISALIGNED" = "ERR" ] || [ -z "$MISALIGNED" ]; then
    echo "  FAIL: cadence_event_triggers cross-org audit → resposta inesperada" >&2
    FAILED=$((FAILED + 1))
  elif [ "$MISALIGNED" != "0" ]; then
    echo "  FAIL: $MISALIGNED cadence_event_triggers com org_id divergente do template — rodar migration de alinhamento" >&2
    FAILED=$((FAILED + 1))
  fi
fi

if [ $FAILED -gt 0 ]; then
  echo "" >&2
  echo "$FAILED/$TOTAL queries falharam. O banco não tem as colunas que o frontend espera." >&2
  exit 1
fi

echo "Schema OK: $TOTAL/$TOTAL queries passaram"
exit 0
