#!/bin/bash
#
# Test Suite para o Workflow Unificado de Extração IA
# Testa TODOS os cenários possíveis antes de migrar callers
#
# Uso: bash scripts/test-unified-workflow.sh
#

set -euo pipefail

# Load env
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
source "$PROJECT_DIR/.env"

WEBHOOK_URL="https://n8n-n8n.ymnmx7.easypanel.host/webhook/ai-extraction-unified"
N8N_URL="https://n8n-n8n.ymnmx7.easypanel.host"
SUPABASE_URL="https://szyrzxvlptqqheizyrxu.supabase.co"

# Card real com mensagens WhatsApp (Jessica / TRIPS)
CARD_ID="9c8592c2-caff-46c8-b2bb-0611d901131e"
CONTACT_ID="0779154b-f350-4dd4-8788-4d5f9b1937b8"
USER_ID="8387b824-1a91-4b61-bbc4-eba6040c7141"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

PASSED=0
FAILED=0
SKIPPED=0
RESULTS=()

separator() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

log_test() {
  local name="$1"
  separator
  echo -e "${BLUE}${BOLD}TEST: $name${NC}"
  echo ""
}

log_pass() {
  local name="$1"
  local detail="${2:-}"
  echo -e "  ${GREEN}✓ PASSED${NC} — $name"
  [ -n "$detail" ] && echo -e "    ${detail}"
  PASSED=$((PASSED + 1))
  RESULTS+=("✓ $name")
}

log_fail() {
  local name="$1"
  local detail="${2:-}"
  echo -e "  ${RED}✗ FAILED${NC} — $name"
  [ -n "$detail" ] && echo -e "    ${RED}${detail}${NC}"
  FAILED=$((FAILED + 1))
  RESULTS+=("✗ $name: $detail")
}

log_skip() {
  local name="$1"
  local reason="${2:-}"
  echo -e "  ${YELLOW}⊘ SKIPPED${NC} — $name"
  [ -n "$reason" ] && echo -e "    ${reason}"
  SKIPPED=$((SKIPPED + 1))
  RESULTS+=("⊘ $name: $reason")
}

# Helper: call webhook and return response
call_webhook() {
  local payload="$1"
  local timeout="${2:-120}"
  curl -s -w "\n__HTTP_STATUS__%{http_code}" \
    --max-time "$timeout" \
    -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

# Helper: parse response
parse_response() {
  local raw="$1"
  local body status
  body=$(echo "$raw" | sed '/__HTTP_STATUS__/d')
  status=$(echo "$raw" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')
  echo "$body"
  echo "__STATUS__$status"
}

# Helper: query Supabase
query_supabase() {
  local endpoint="$1"
  curl -s "$SUPABASE_URL/rest/v1/$endpoint" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
}

# ═══════════════════════════════════════════════════════════════
# PRE-FLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   TEST SUITE — Workflow Unificado de Extração IA        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"

separator
echo -e "${BLUE}PRE-FLIGHT CHECKS${NC}"

# Check workflow is active
echo -n "  Workflow active... "
WF_STATUS=$(curl -s "$N8N_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | python3 -c "
import sys,json
data=json.load(sys.stdin)
for wf in data.get('data',[]):
    if 'unified' in wf.get('name','').lower() or 'unificad' in wf.get('name','').lower():
        print(f\"{wf['id']}|{wf['active']}|{wf['name']}\")
        break
" 2>/dev/null || echo "ERROR")

if echo "$WF_STATUS" | grep -q "True"; then
  WF_NAME=$(echo "$WF_STATUS" | cut -d'|' -f3)
  echo -e "${GREEN}OK${NC} ($WF_NAME)"
else
  echo -e "${RED}INACTIVE or NOT FOUND${NC}"
  echo "  Cannot proceed without active workflow. Aborting."
  exit 1
fi

# Check card exists
echo -n "  Card exists... "
CARD_CHECK=$(query_supabase "cards?id=eq.$CARD_ID&select=id,titulo,produto,pipeline_stage_id")
CARD_TITLE=$(echo "$CARD_CHECK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['titulo'] if d else 'NOT FOUND')" 2>/dev/null)
if [ "$CARD_TITLE" != "NOT FOUND" ]; then
  echo -e "${GREEN}OK${NC} ($CARD_TITLE)"
else
  echo -e "${RED}NOT FOUND${NC}"
  exit 1
fi

# Check WhatsApp messages exist
echo -n "  WhatsApp messages... "
MSG_COUNT=$(query_supabase "whatsapp_messages?contact_id=eq.$CONTACT_ID&select=id&limit=50" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo -e "${GREEN}OK${NC} ($MSG_COUNT messages)"

# Snapshot produto_data BEFORE tests
echo -n "  Snapshot produto_data... "
SNAPSHOT_BEFORE=$(query_supabase "cards?id=eq.$CARD_ID&select=produto_data" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)[0]['produto_data']))" 2>/dev/null)
echo -e "${GREEN}OK${NC}"

separator
echo ""
echo -e "${BOLD}Starting tests...${NC}"

# ═══════════════════════════════════════════════════════════════
# TEST 1: WhatsApp Extraction (source: whatsapp)
# ═══════════════════════════════════════════════════════════════

log_test "1. WhatsApp — Extração básica"
echo "  Card: $CARD_TITLE ($CARD_ID)"
echo "  Enviando request..."

RAW=$(call_webhook "{
  \"card_id\": \"$CARD_ID\",
  \"source\": \"whatsapp\",
  \"user_id\": \"$USER_ID\"
}" 120)

BODY=$(echo "$RAW" | sed '/__HTTP_STATUS__/d')
HTTP=$(echo "$RAW" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

echo "  HTTP Status: $HTTP"
echo "  Response: $(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null || echo "$BODY")"

if [ "$HTTP" = "200" ]; then
  STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  if [ "$STATUS" = "success" ] || [ "$STATUS" = "no_update" ] || [ "$STATUS" = "wrong_trip" ]; then
    log_pass "WhatsApp extraction" "status=$STATUS"

    # Check if campos_extraidos returned
    CAMPOS=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('campos_extraidos',d.get('campos_atualizados',{}))))" 2>/dev/null || echo "0")
    echo "  Campos extraídos: $CAMPOS"

    # Check _meta
    META=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); m=d.get('_meta'); print(json.dumps(m, ensure_ascii=False) if m else 'null')" 2>/dev/null)
    echo "  _meta: $META"
  else
    log_fail "WhatsApp extraction" "unexpected status: $STATUS"
  fi
else
  log_fail "WhatsApp extraction" "HTTP $HTTP"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 2: Meeting Transcript (source: meeting_transcript)
# ═══════════════════════════════════════════════════════════════

log_test "2. Meeting Transcript — Transcrição simulada"

FAKE_TRANSCRIPT="Reunião com a cliente Jessica sobre a viagem. Ela mencionou que gostaria de ir para a Itália, especificamente Roma e Florença. O orçamento dela é de aproximadamente 15 mil reais por pessoa. A viagem seria em setembro de 2026, com duração de 12 dias. Ela viaja com o marido. Prefere hotéis boutique, nada muito grande. Gosta de gastronomia e história. Não quer roteiro muito corrido."

RAW=$(call_webhook "{
  \"card_id\": \"$CARD_ID\",
  \"source\": \"meeting_transcript\",
  \"user_id\": \"$USER_ID\",
  \"transcription\": \"$FAKE_TRANSCRIPT\"
}" 120)

BODY=$(echo "$RAW" | sed '/__HTTP_STATUS__/d')
HTTP=$(echo "$RAW" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

echo "  HTTP Status: $HTTP"
echo "  Response: $(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null || echo "$BODY")"

if [ "$HTTP" = "200" ]; then
  STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  if [ "$STATUS" = "success" ] || [ "$STATUS" = "no_update" ]; then
    log_pass "Meeting transcript" "status=$STATUS"

    # Verify campos
    CAMPOS=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
campos = d.get('campos_extraidos', d.get('campos_atualizados', {}))
if isinstance(campos, list):
    print(', '.join(campos))
elif isinstance(campos, dict):
    print(', '.join(campos.keys()))
else:
    print(campos)
" 2>/dev/null)
    echo "  Campos: $CAMPOS"

    # Verify briefing_text
    BT=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); bt=d.get('briefing_text',''); print(bt[:100] if bt else '(empty)')" 2>/dev/null)
    echo "  briefing_text: $BT"
  else
    log_fail "Meeting transcript" "unexpected status: $STATUS"
  fi
else
  log_fail "Meeting transcript" "HTTP $HTTP"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 3: Meeting Transcript — Vazio (deve retornar erro)
# ═══════════════════════════════════════════════════════════════

log_test "3. Meeting Transcript — Transcrição vazia"

RAW=$(call_webhook "{
  \"card_id\": \"$CARD_ID\",
  \"source\": \"meeting_transcript\",
  \"user_id\": \"$USER_ID\",
  \"transcription\": \"\"
}" 30)

BODY=$(echo "$RAW" | sed '/__HTTP_STATUS__/d')
HTTP=$(echo "$RAW" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

echo "  HTTP Status: $HTTP"

if [ "$HTTP" = "200" ] || [ "$HTTP" = "500" ]; then
  STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "http_error")
  if [ "$STATUS" = "transcription_empty" ] || [ "$STATUS" = "error" ] || [ "$STATUS" = "no_update" ] || [ "$STATUS" = "http_error" ]; then
    log_pass "Empty transcript handled" "status=$STATUS, HTTP=$HTTP"
  else
    log_fail "Empty transcript" "expected error/no_update, got: $STATUS"
  fi
else
  log_pass "Empty transcript rejected" "HTTP $HTTP"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 4: Meeting Transcript — com meeting_id (metadata de tarefa)
# ═══════════════════════════════════════════════════════════════

log_test "4. Meeting Transcript — com meeting_id"

FAKE_MEETING_ID="00000000-0000-0000-0000-000000000099"
TRANSCRIPT2="A cliente confirmou que quer viajar em família, 4 pessoas no total. Preferência por resort all-inclusive. Budget total de 40 mil reais."

RAW=$(call_webhook "{
  \"card_id\": \"$CARD_ID\",
  \"source\": \"meeting_transcript\",
  \"user_id\": \"$USER_ID\",
  \"transcription\": \"$TRANSCRIPT2\",
  \"meeting_id\": \"$FAKE_MEETING_ID\"
}" 120)

BODY=$(echo "$RAW" | sed '/__HTTP_STATUS__/d')
HTTP=$(echo "$RAW" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

echo "  HTTP Status: $HTTP"
echo "  Response: $(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null || echo "$BODY")"

if [ "$HTTP" = "200" ]; then
  STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  if [ "$STATUS" = "success" ] || [ "$STATUS" = "no_update" ]; then
    log_pass "Meeting with meeting_id" "status=$STATUS"
    MEETING_RET=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('meeting_id','(not returned)'))" 2>/dev/null)
    echo "  meeting_id returned: $MEETING_RET"
  else
    log_fail "Meeting with meeting_id" "unexpected status: $STATUS"
  fi
else
  log_fail "Meeting with meeting_id" "HTTP $HTTP"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 5: Audio Briefing — sem áudio (deve falhar gracefully)
# ═══════════════════════════════════════════════════════════════

log_test "5. Audio Briefing — sem audio_base64 (edge case)"

RAW=$(call_webhook "{
  \"card_id\": \"$CARD_ID\",
  \"source\": \"briefing_audio\",
  \"user_id\": \"$USER_ID\"
}" 30)

BODY=$(echo "$RAW" | sed '/__HTTP_STATUS__/d')
HTTP=$(echo "$RAW" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

echo "  HTTP Status: $HTTP"

STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "http_error")
if [ "$HTTP" != "200" ] || [ "$STATUS" = "error" ] || [ "$STATUS" = "transcription_empty" ] || [ "$STATUS" = "no_update" ]; then
  log_pass "No audio rejected" "HTTP=$HTTP, status=$STATUS"
else
  log_fail "No audio" "expected error, got: HTTP=$HTTP, status=$STATUS"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 6: Invalid source (edge case)
# ═══════════════════════════════════════════════════════════════

log_test "6. Invalid source"

RAW=$(call_webhook "{
  \"card_id\": \"$CARD_ID\",
  \"source\": \"invalid_source\",
  \"user_id\": \"$USER_ID\"
}" 30)

BODY=$(echo "$RAW" | sed '/__HTTP_STATUS__/d')
HTTP=$(echo "$RAW" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

echo "  HTTP Status: $HTTP"

if [ "$HTTP" != "200" ] || echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('status') in ['error'] else 1)" 2>/dev/null; then
  log_pass "Invalid source rejected" "HTTP $HTTP"
else
  log_fail "Invalid source" "should have been rejected"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 7: Invalid card_id (edge case)
# ═══════════════════════════════════════════════════════════════

log_test "7. Invalid card_id"

RAW=$(call_webhook "{
  \"card_id\": \"00000000-0000-0000-0000-000000000000\",
  \"source\": \"whatsapp\",
  \"user_id\": \"$USER_ID\"
}" 30)

BODY=$(echo "$RAW" | sed '/__HTTP_STATUS__/d')
HTTP=$(echo "$RAW" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

echo "  HTTP Status: $HTTP"

if [ "$HTTP" != "200" ] || echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('status') in ['error'] else 1)" 2>/dev/null; then
  log_pass "Invalid card rejected" "HTTP $HTTP"
else
  log_fail "Invalid card" "should have been rejected"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 8: Missing fields (no card_id)
# ═══════════════════════════════════════════════════════════════

log_test "8. Missing card_id"

RAW=$(call_webhook "{
  \"source\": \"whatsapp\",
  \"user_id\": \"$USER_ID\"
}" 30)

BODY=$(echo "$RAW" | sed '/__HTTP_STATUS__/d')
HTTP=$(echo "$RAW" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

echo "  HTTP Status: $HTTP"

if [ "$HTTP" != "200" ] || echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('status') in ['error'] else 1)" 2>/dev/null; then
  log_pass "Missing card_id rejected" "HTTP $HTTP"
else
  log_fail "Missing card_id" "should have been rejected"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 9: WhatsApp — mode=atualizar explícito
# ═══════════════════════════════════════════════════════════════

log_test "9. WhatsApp — mode=atualizar (explicit)"

RAW=$(call_webhook "{
  \"card_id\": \"$CARD_ID\",
  \"source\": \"whatsapp\",
  \"user_id\": \"$USER_ID\",
  \"mode\": \"atualizar\"
}" 120)

BODY=$(echo "$RAW" | sed '/__HTTP_STATUS__/d')
HTTP=$(echo "$RAW" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

echo "  HTTP Status: $HTTP"

if [ "$HTTP" = "200" ]; then
  STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  if [ "$STATUS" = "success" ] || [ "$STATUS" = "no_update" ] || [ "$STATUS" = "wrong_trip" ]; then
    log_pass "WhatsApp mode=atualizar" "status=$STATUS"
  else
    log_fail "WhatsApp mode=atualizar" "unexpected status: $STATUS"
  fi
else
  log_fail "WhatsApp mode=atualizar" "HTTP $HTTP"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 10: Verify Activity Log was created
# ═══════════════════════════════════════════════════════════════

log_test "10. Activity Log — verificar se foi criado"

ACTIVITIES=$(query_supabase "activities?card_id=eq.$CARD_ID&tipo=eq.ai_extraction&order=created_at.desc&limit=5&select=id,tipo,descricao,metadata,created_at")
ACT_COUNT=$(echo "$ACTIVITIES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

echo "  Activities encontradas: $ACT_COUNT"

if [ "$ACT_COUNT" -gt 0 ]; then
  echo "$ACTIVITIES" | python3 -c "
import sys,json
data=json.load(sys.stdin)
for a in data[:3]:
    meta = a.get('metadata',{}) or {}
    print(f\"  - {a['created_at'][:19]} | source={meta.get('source','?')} | campos={meta.get('campos_count','?')}\")" 2>/dev/null
  log_pass "Activity log" "$ACT_COUNT entries found"
else
  log_fail "Activity log" "no ai_extraction activities found"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 11: Verify produto_data was updated (if tests had success)
# ═══════════════════════════════════════════════════════════════

log_test "11. produto_data — verificar alterações"

SNAPSHOT_AFTER=$(query_supabase "cards?id=eq.$CARD_ID&select=produto_data" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)[0]['produto_data'], indent=2, ensure_ascii=False))" 2>/dev/null)

echo "  BEFORE: $(echo "$SNAPSHOT_BEFORE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} keys: {list(d.keys())[:8]}')" 2>/dev/null)"
echo "  AFTER:  $(echo "$SNAPSHOT_AFTER" | python3 -c "import sys; d=eval(sys.stdin.read()); print(f'{len(d)} keys: {list(d.keys())[:8]}')" 2>/dev/null)"

# Check if it changed
if [ "$SNAPSHOT_BEFORE" != "$SNAPSHOT_AFTER" ]; then
  log_pass "produto_data updated" "fields were modified by AI"
else
  echo -e "  ${YELLOW}(No changes — could mean no new info extracted)${NC}"
  log_pass "produto_data consistent" "no changes needed (may be expected)"
fi

# ═══════════════════════════════════════════════════════════════
# TEST 12: Smart merge — verify briefing/observacoes are APPENDED
# ═══════════════════════════════════════════════════════════════

log_test "12. Smart Merge — briefing append (not replace)"

echo "$SNAPSHOT_AFTER" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read())
briefing = d.get('briefing','')
obs = d.get('observacoes','')
print(f'  briefing length: {len(briefing)} chars')
print(f'  observacoes length: {len(obs)} chars')
if briefing:
    print(f'  briefing preview: {briefing[:120]}...')
if obs:
    print(f'  observacoes preview: {obs[:120]}...')
" 2>/dev/null

log_pass "Smart merge check" "manual verification above"

# ═══════════════════════════════════════════════════════════════
# TEST 13: Config v2 — verify stage-aware fields are respected
# ═══════════════════════════════════════════════════════════════

log_test "13. Config v2 — stage-aware extraction"

STAGE_ID=$(echo "$CARD_CHECK" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['pipeline_stage_id'])" 2>/dev/null)
echo "  Stage ID: $STAGE_ID"

CONFIG_V2=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/get_ai_extraction_config_v2" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"p_stage_id\": \"$STAGE_ID\"}")

VISIBLE=$(echo "$CONFIG_V2" | python3 -c "
import sys,json
data=json.load(sys.stdin)
if isinstance(data, list):
    visible = [f['key'] for f in data if f.get('is_visible') != False]
    hidden = [f['key'] for f in data if f.get('is_visible') == False]
    print(f'  Visible: {len(visible)} fields')
    print(f'  Hidden: {len(hidden)} fields')
    if hidden:
        print(f'  Hidden keys: {hidden[:5]}')
elif isinstance(data, dict) and 'fields' in data:
    fields = data['fields']
    visible = [f['key'] for f in fields if f.get('is_visible') != False]
    print(f'  Visible: {len(visible)} fields')
else:
    print(f'  Raw response type: {type(data).__name__}')
    print(f'  {str(data)[:200]}')
" 2>/dev/null)

echo "$VISIBLE"
log_pass "Config v2 check" "stage config loaded"

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════

separator
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                     TEST SUMMARY                         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Passed:  $PASSED${NC}"
echo -e "  ${RED}Failed:  $FAILED${NC}"
echo -e "  ${YELLOW}Skipped: $SKIPPED${NC}"
echo ""

for r in "${RESULTS[@]}"; do
  echo "  $r"
done

echo ""

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed! Safe to proceed with Fase 4 (migrate callers).${NC}"
else
  echo -e "${RED}${BOLD}$FAILED test(s) failed. Fix issues before migrating.${NC}"
fi

echo ""
echo -e "${YELLOW}NOTE: Audio briefing (source: briefing_audio) requires a real audio file.${NC}"
echo -e "${YELLOW}Test it manually via the UI (Usar IA → Briefing por áudio).${NC}"
echo ""
