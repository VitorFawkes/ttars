#!/bin/bash
set -e
SVC=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
ANON=$(grep VITE_SUPABASE_ANON_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
URL="https://szyrzxvlptqqheizyrxu.supabase.co"
SILVIA="0037915f-fdb8-48bf-b31e-207788878b5e"

CARDS=(
  "397d5ed5-d789-4b6f-bc93-b2d12bb30fc2"  # Roma D+45
  "25dac139-3917-4690-8b6e-aeed4e278f5c"  # Veneza D+10
  "6fbb893a-9b74-473a-93ab-4476196c4881"  # Paris D+2
  "b9668198-b78e-470e-8a6d-84dae2d9cf8b"  # Tokyo em viagem
  "6e017ad5-090c-4773-9ee4-607d568958a0"  # NY pós-viagem
)

ROMA="${CARDS[0]}"
VENEZA="${CARDS[1]}"
PARIS="${CARDS[2]}"
TOKYO="${CARDS[3]}"
NY="${CARDS[4]}"

# === TEST 1: RPC criar atendimento (case válido) ===
echo "=== TEST 1: rpc_criar_atendimento_concierge (válido) ==="
RESP=$(curl -s -X POST "$URL/rest/v1/rpc/rpc_criar_atendimento_concierge" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d @<(cat <<JSON
{
  "p_card_id": "$ROMA",
  "p_tipo_concierge": "oferta",
  "p_categoria": "assento",
  "p_source": "manual",
  "p_titulo": "Vender upgrade de assento Latam",
  "p_data_vencimento": "2026-05-15T18:00:00Z",
  "p_responsavel_id": "$SILVIA",
  "p_prioridade": "alta",
  "p_valor": 800,
  "p_cobrado_de": "cliente"
}
JSON
))
echo "Resposta: $RESP"
ATD1=$(echo "$RESP" | tr -d '"')
echo "ATD1=$ATD1"
echo ""

# === TEST 2: RPC com card inexistente (deve falhar) ===
echo "=== TEST 2: card inexistente (deve falhar) ==="
RESP=$(curl -s -X POST "$URL/rest/v1/rpc/rpc_criar_atendimento_concierge" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d '{"p_card_id":"00000000-0000-0000-0000-000000000000","p_tipo_concierge":"oferta","p_categoria":"assento","p_source":"manual","p_titulo":"X"}')
echo "Resposta: $RESP"
echo ""

# === TEST 3: RPC tipo inválido (deve falhar) ===
echo "=== TEST 3: tipo_concierge inválido (deve falhar) ==="
RESP=$(curl -s -X POST "$URL/rest/v1/rpc/rpc_criar_atendimento_concierge" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"p_card_id\":\"$ROMA\",\"p_tipo_concierge\":\"inexistente\",\"p_categoria\":\"assento\",\"p_source\":\"manual\",\"p_titulo\":\"X\"}")
echo "Resposta: $RESP"
echo ""

# === TEST 4: criar 4 atendimentos diferentes pra Veneza ===
echo "=== TEST 4: criar mix de atendimentos ==="
for tipo_cat in "oferta:passeio:Vender city tour Veneza:1200" "reserva:restaurante:Reservar Cipriani sábado 20h:0" "suporte:hotel_contato:Voo atrasou - remarcar check-in:0" "operacional:welcome_letter:Carta de boas-vindas hotel:0"; do
  IFS=':' read -r tipo cat titulo valor <<< "$tipo_cat"
  PAYLOAD=$(python3 -c "
import json
data = {
  'p_card_id': '$VENEZA',
  'p_tipo_concierge': '$tipo',
  'p_categoria': '$cat',
  'p_source': 'manual',
  'p_titulo': '$titulo',
  'p_data_vencimento': '2026-05-04T18:00:00Z',
  'p_responsavel_id': '$SILVIA',
  'p_prioridade': 'media',
}
if $valor > 0:
  data['p_valor'] = $valor
  data['p_cobrado_de'] = 'cliente'
print(json.dumps(data))
")
  RESP=$(curl -s -X POST "$URL/rest/v1/rpc/rpc_criar_atendimento_concierge" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")
  echo "  $tipo/$cat: $RESP"
done
echo ""

# === TEST 5: criar VENCIDOS (data no passado) pra Paris e Tokyo ===
echo "=== TEST 5: atendimentos vencidos ==="
for entry in "$PARIS:passaporte:Pedir passaporte Pedro:2026-04-22" "$TOKYO:check_in_executar:Check-in Latam JL047 (vencido):2026-04-25" "$TOKYO:suporte:URGENTE: cliente perdeu passaporte:2026-04-26"; do
  IFS=':' read -r card cat titulo prazo <<< "$entry"
  RESP=$(curl -s -X POST "$URL/rest/v1/rpc/rpc_criar_atendimento_concierge" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
    -H "Content-Type: application/json" \
    -d "{\"p_card_id\":\"$card\",\"p_tipo_concierge\":\"operacional\",\"p_categoria\":\"$cat\",\"p_source\":\"manual\",\"p_titulo\":\"$titulo\",\"p_data_vencimento\":\"${prazo}T10:00:00Z\",\"p_responsavel_id\":\"$SILVIA\"}")
  echo "  $cat: $RESP"
done
echo ""

# === TEST 6: pesquisa pós-viagem pra NY ===
echo "=== TEST 6: pesquisa pós-viagem ==="
RESP=$(curl -s -X POST "$URL/rest/v1/rpc/rpc_criar_atendimento_concierge" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"p_card_id\":\"$NY\",\"p_tipo_concierge\":\"operacional\",\"p_categoria\":\"pesquisa_pos\",\"p_source\":\"cadencia\",\"p_titulo\":\"Pesquisa de feedback Família Rocha\",\"p_data_vencimento\":\"2026-04-29T15:00:00Z\",\"p_responsavel_id\":\"$SILVIA\"}")
echo "Resposta: $RESP"

echo ""
echo "=== Total atendimentos criados: ==="
curl -s "$URL/rest/v1/atendimentos_concierge?card_id=in.($ROMA,$VENEZA,$PARIS,$TOKYO,$NY)&select=id,card_id,tipo_concierge,categoria,outcome,valor" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {len(d)} atendimentos')
for r in d:
  print(f\"  {r['id'][:8]} {r['tipo_concierge']:12} {r['categoria']:20} valor={r.get('valor')}\")"
