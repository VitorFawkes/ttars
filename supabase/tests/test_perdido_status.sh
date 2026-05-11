#!/bin/bash
set -euo pipefail

# =============================================================================
# Teste Robusto: Card Perdido vs Ativo
#
# Valida que ao marcar um card como "perdido" a partir de QUALQUER etapa,
# o status_comercial é corretamente setado pelo trigger e o card deixa de
# aparecer como ativo em queries do sistema.
#
# Uso: bash supabase/tests/test_perdido_status.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../.." || exit 1
source .env 2>/dev/null || true

URL="${VITE_SUPABASE_URL}"
ANON="${VITE_SUPABASE_ANON_KEY}"
KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "ERRO: variáveis de ambiente não disponíveis (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
  exit 1
fi

PASSED=0
FAILED=0
TOTAL=0
TEST_CARD_IDS=()

# UUID determinístico para cards de teste (1 por pipeline)
TEST_UUIDS=(
  "00000000-0000-4000-a000-000000e5e001"
  "00000000-0000-4000-a000-000000e5e002"
  "00000000-0000-4000-a000-000000e5e003"
  "00000000-0000-4000-a000-000000e5e004"
  "00000000-0000-4000-a000-000000e5e005"
)

# =============================================================================
# Helpers
# =============================================================================

api_get() {
  curl -s "${URL}/rest/v1/$1" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Accept: application/json"
}

api_post() {
  curl -s -X POST "${URL}/rest/v1/$1" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$2"
}

api_patch() {
  curl -s -X PATCH "${URL}/rest/v1/$1" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$2"
}

api_delete() {
  curl -s -X DELETE "${URL}/rest/v1/$1" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}"
}

api_rpc() {
  curl -s -X POST "${URL}/rest/v1/rpc/$1" \
    -H "apikey: ${ANON}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d "$2"
}

assert_eq() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    echo "  [PASS] $label"
    PASSED=$((PASSED + 1))
  else
    echo "  [FAIL] $label — esperado='$expected', obtido='$actual'" >&2
    FAILED=$((FAILED + 1))
  fi
}

assert_empty() {
  local label="$1"
  local json="$2"
  TOTAL=$((TOTAL + 1))
  local count
  count=$(echo "$json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "-1")
  if [ "$count" = "0" ]; then
    echo "  [PASS] $label (vazio como esperado)"
    PASSED=$((PASSED + 1))
  else
    echo "  [FAIL] $label — esperado vazio, obteve $count registros" >&2
    FAILED=$((FAILED + 1))
  fi
}

assert_not_empty() {
  local label="$1"
  local json="$2"
  TOTAL=$((TOTAL + 1))
  local count
  count=$(echo "$json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "-1")
  if [ "$count" != "0" ] && [ "$count" != "-1" ]; then
    echo "  [PASS] $label ($count registros)"
    PASSED=$((PASSED + 1))
  else
    echo "  [FAIL] $label — esperado não-vazio, obteve $count registros" >&2
    FAILED=$((FAILED + 1))
  fi
}

get_card_status() {
  local card_id="$1"
  api_get "cards?id=eq.${card_id}&select=status_comercial,pipeline_stage_id" \
    | python3 -c "
import sys,json
r=json.load(sys.stdin)
if isinstance(r, list) and len(r) > 0:
    print(r[0]['status_comercial'])
else:
    print('NOT_FOUND')
"
}

get_card_stage() {
  local card_id="$1"
  api_get "cards?id=eq.${card_id}&select=pipeline_stage_id" \
    | python3 -c "
import sys,json
r=json.load(sys.stdin)
if isinstance(r, list) and len(r) > 0:
    print(r[0]['pipeline_stage_id'])
else:
    print('NOT_FOUND')
"
}

cleanup() {
  echo ""
  echo "=== Cleanup ==="
  if [ ${#TEST_CARD_IDS[@]} -eq 0 ]; then
    echo "  Nenhum card de teste para limpar"
    return
  fi
  for cid in "${TEST_CARD_IDS[@]}"; do
    # Hard delete (not soft delete)
    api_delete "cards?id=eq.${cid}" >/dev/null 2>&1
    echo "  Deletado card de teste: $cid"
  done
}

trap cleanup EXIT

# =============================================================================
# Fase 1: Descobrir topologia dos pipelines
# =============================================================================

echo "=== Teste Robusto: Card Perdido vs Ativo ==="
echo ""
echo "--- Fase 1: Descoberta de Topologia ---"

STAGES_JSON=$(api_get "pipeline_stages?ativo=eq.true&select=id,nome,pipeline_id,is_lost,is_won,is_sdr_won,is_planner_won,is_pos_won,auto_advance,ordem&order=ordem.asc")

# Extrair pipelines únicos e suas etapas
PIPELINES=$(echo "$STAGES_JSON" | python3 -c "
import sys, json
stages = json.load(sys.stdin)
pipelines = {}
for s in stages:
    pid = s['pipeline_id']
    if pid not in pipelines:
        pipelines[pid] = {'lost': [], 'won': [], 'normal': [], 'auto_advance': []}
    flags = pipelines[pid]
    if s.get('is_lost'):
        flags['lost'].append(s['id'])
    elif s.get('is_won'):
        flags['won'].append(s['id'])
    else:
        flags['normal'].append(s['id'])
    if s.get('auto_advance'):
        flags['auto_advance'].append(s['id'])

for pid, f in pipelines.items():
    lost = f['lost'][0] if f['lost'] else 'NONE'
    won = f['won'][0] if f['won'] else 'NONE'
    normals = ','.join(f['normal'])
    autos = ','.join(f['auto_advance'])
    print(f'{pid}|{lost}|{won}|{normals}|{autos}')
")

echo "  Pipelines encontrados: $(echo "$PIPELINES" | wc -l | tr -d ' ')"

# =============================================================================
# Fase 2-4: Loop por pipeline
# =============================================================================

PIPELINE_INDEX=0

while IFS='|' read -r PIPELINE_ID LOST_STAGE WON_STAGE NORMAL_STAGES_CSV AUTO_ADVANCE_CSV; do
  PIPELINE_INDEX=$((PIPELINE_INDEX + 1))

  if [ "$LOST_STAGE" = "NONE" ]; then
    echo ""
    echo "--- Pipeline $PIPELINE_ID: SEM etapa perdida, pulando ---"
    continue
  fi

  # Buscar nome do pipeline
  PIPELINE_NAME=$(echo "$STAGES_JSON" | python3 -c "
import sys, json
stages = json.load(sys.stdin)
for s in stages:
    if s['pipeline_id'] == '$PIPELINE_ID':
        print(s.get('nome', 'unknown'))
        break
" 2>/dev/null || echo "Pipeline $PIPELINE_INDEX")

  # Escolher UUID de teste (1 por pipeline)
  TEST_CARD_ID="${TEST_UUIDS[$((PIPELINE_INDEX - 1))]}"

  # Parsear normal stages (excluindo auto_advance)
  IFS=',' read -ra NORMAL_STAGES <<< "$NORMAL_STAGES_CSV"
  AUTO_STAGES=()
  if [ -n "${AUTO_ADVANCE_CSV:-}" ]; then
    IFS=',' read -ra AUTO_STAGES <<< "$AUTO_ADVANCE_CSV"
  fi

  # Filtrar stages com auto_advance
  TESTABLE_STAGES=()
  for sid in "${NORMAL_STAGES[@]}"; do
    is_auto=false
    if [ ${#AUTO_STAGES[@]} -gt 0 ]; then
      for aid in "${AUTO_STAGES[@]}"; do
        if [ "$sid" = "$aid" ]; then
          is_auto=true
          break
        fi
      done
    fi
    if [ "$is_auto" = false ]; then
      TESTABLE_STAGES+=("$sid")
    fi
  done

  FIRST_STAGE="${TESTABLE_STAGES[0]}"

  echo ""
  echo "--- Pipeline: $PIPELINE_ID ---"
  echo "  Lost stage: $LOST_STAGE"
  echo "  Won stage: ${WON_STAGE:-NONE}"
  echo "  Etapas testáveis: ${#TESTABLE_STAGES[@]} (excluindo auto_advance)"

  # Buscar produto do pipeline
  PRODUTO=$(api_get "pipelines?id=eq.${PIPELINE_ID}&select=produto" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print(r[0]['produto'] if r else 'TRIPS')" 2>/dev/null)

  # ---- Fase 3: Criar card de teste ----
  echo ""
  echo "  Criando card de teste..."

  CREATE_RESULT=$(api_post "cards" "{
    \"id\": \"${TEST_CARD_ID}\",
    \"titulo\": \"[TEST-PERDIDO] Teste Status Integridade\",
    \"pipeline_id\": \"${PIPELINE_ID}\",
    \"pipeline_stage_id\": \"${FIRST_STAGE}\",
    \"produto\": \"${PRODUTO}\",
    \"status_comercial\": \"aberto\"
  }")

  # Verificar se criou
  CREATED_STATUS=$(get_card_status "$TEST_CARD_ID")
  if [ "$CREATED_STATUS" = "NOT_FOUND" ]; then
    echo "  ERRO: Falha ao criar card de teste. Resposta: $CREATE_RESULT" >&2
    continue
  fi

  TEST_CARD_IDS+=("$TEST_CARD_ID")
  assert_eq "Card criado com status aberto" "$CREATED_STATUS" "aberto"

  # ---- Fase 4: Loop por cada etapa ----
  echo ""
  echo "  --- Loop: etapa → perdido → verificação → recovery ---"

  for STAGE_ID in "${TESTABLE_STAGES[@]}"; do
    # Buscar nome da etapa
    STAGE_NAME=$(echo "$STAGES_JSON" | python3 -c "
import sys, json
stages = json.load(sys.stdin)
for s in stages:
    if s['id'] == '$STAGE_ID':
        print(s['nome'])
        break
" 2>/dev/null || echo "$STAGE_ID")

    # 4a. Mover para etapa normal
    api_rpc "mover_card" "{\"p_card_id\": \"${TEST_CARD_ID}\", \"p_nova_etapa_id\": \"${STAGE_ID}\"}" >/dev/null

    # Aguardar auto_advance se necessário (o card pode ter sido movido)
    ACTUAL_STAGE=$(get_card_stage "$TEST_CARD_ID")
    STATUS_AFTER_NORMAL=$(get_card_status "$TEST_CARD_ID")
    assert_eq "[$STAGE_NAME] Em etapa normal → status aberto" "$STATUS_AFTER_NORMAL" "aberto"

    # 4b. Mover para etapa perdida
    api_rpc "mover_card" "{\"p_card_id\": \"${TEST_CARD_ID}\", \"p_nova_etapa_id\": \"${LOST_STAGE}\"}" >/dev/null

    STATUS_AFTER_LOST=$(get_card_status "$TEST_CARD_ID")
    assert_eq "[$STAGE_NAME] → Perdido: status_comercial=perdido" "$STATUS_AFTER_LOST" "perdido"

    # 4c. Verificar exclusão de queries ativas
    ACTIVE_QUERY=$(api_get "cards?id=eq.${TEST_CARD_ID}&status_comercial=neq.perdido&select=id")
    assert_empty "[$STAGE_NAME] → Perdido: excluído de query ativa" "$ACTIVE_QUERY"

    LOST_QUERY=$(api_get "cards?id=eq.${TEST_CARD_ID}&status_comercial=eq.perdido&select=id")
    assert_not_empty "[$STAGE_NAME] → Perdido: presente em query perdidos" "$LOST_QUERY"

    # 4d. Recovery: mover de volta para etapa normal
    api_rpc "mover_card" "{\"p_card_id\": \"${TEST_CARD_ID}\", \"p_nova_etapa_id\": \"${STAGE_ID}\"}" >/dev/null

    STATUS_AFTER_RECOVERY=$(get_card_status "$TEST_CARD_ID")
    assert_eq "[$STAGE_NAME] Recovery: status volta a aberto" "$STATUS_AFTER_RECOVERY" "aberto"
  done

  # ---- Fase 5: Edge Cases ----
  echo ""
  echo "  --- Edge Cases ---"

  # 5a. Update direto de status_comercial (trigger deve overridar)
  api_patch "cards?id=eq.${TEST_CARD_ID}" '{"status_comercial": "perdido"}' >/dev/null
  STATUS_AFTER_DIRECT=$(get_card_status "$TEST_CARD_ID")
  assert_eq "EDGE: PATCH direto status=perdido em etapa normal → trigger corrige para aberto" "$STATUS_AFTER_DIRECT" "aberto"

  # 5b. Won → Lost (se won stage existe)
  if [ "$WON_STAGE" != "NONE" ]; then
    api_rpc "mover_card" "{\"p_card_id\": \"${TEST_CARD_ID}\", \"p_nova_etapa_id\": \"${WON_STAGE}\"}" >/dev/null
    STATUS_WON=$(get_card_status "$TEST_CARD_ID")
    assert_eq "EDGE: Mover para Won → status=ganho" "$STATUS_WON" "ganho"

    api_rpc "mover_card" "{\"p_card_id\": \"${TEST_CARD_ID}\", \"p_nova_etapa_id\": \"${LOST_STAGE}\"}" >/dev/null
    STATUS_WON_TO_LOST=$(get_card_status "$TEST_CARD_ID")
    assert_eq "EDGE: Won → Lost → status=perdido" "$STATUS_WON_TO_LOST" "perdido"
  fi

  # 5c. Double-move to lost
  api_rpc "mover_card" "{\"p_card_id\": \"${TEST_CARD_ID}\", \"p_nova_etapa_id\": \"${LOST_STAGE}\"}" >/dev/null
  STATUS_DOUBLE=$(get_card_status "$TEST_CARD_ID")
  assert_eq "EDGE: Double-move para Lost → status=perdido (idempotente)" "$STATUS_DOUBLE" "perdido"

  # 5d. Lost → Normal (reativação)
  api_rpc "mover_card" "{\"p_card_id\": \"${TEST_CARD_ID}\", \"p_nova_etapa_id\": \"${FIRST_STAGE}\"}" >/dev/null
  STATUS_REACTIVATED=$(get_card_status "$TEST_CARD_ID")
  assert_eq "EDGE: Lost → Normal (reativação) → status=aberto" "$STATUS_REACTIVATED" "aberto"

  # ---- Fase 6: Cross-Query Verification ----
  echo ""
  echo "  --- Cross-Query Verification ---"

  # Colocar card em perdido para verificações
  api_rpc "mover_card" "{\"p_card_id\": \"${TEST_CARD_ID}\", \"p_nova_etapa_id\": \"${LOST_STAGE}\"}" >/dev/null

  # Simular query WhatsApp linking
  WA_QUERY=$(api_get "cards?id=eq.${TEST_CARD_ID}&status_comercial=not.in.(ganho,perdido)&select=id")
  assert_empty "CROSS: WhatsApp linking query exclui card perdido" "$WA_QUERY"

  # Verificar que card aparece na etapa perdida
  TERMINAL_QUERY=$(api_get "cards?id=eq.${TEST_CARD_ID}&pipeline_stage_id=eq.${LOST_STAGE}&select=id")
  assert_not_empty "CROSS: Card aparece na etapa Fechado-Perdido" "$TERMINAL_QUERY"

  # Verificar filtro por is_lost stage (simula Kanban excludeTerminalStages)
  # Card em lost stage deve ser excluído quando filtramos por NOT in terminal stages
  KANBAN_QUERY=$(api_get "cards?id=eq.${TEST_CARD_ID}&pipeline_stage_id=neq.${LOST_STAGE}&select=id")
  assert_empty "CROSS: Kanban (excluindo terminal) não mostra card perdido" "$KANBAN_QUERY"

done <<< "$PIPELINES"

# =============================================================================
# Resumo
# =============================================================================

echo ""
echo "============================================"
echo "  Resultado: ${PASSED}/${TOTAL} PASSED, ${FAILED} FAILED"
echo "============================================"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
exit 0
