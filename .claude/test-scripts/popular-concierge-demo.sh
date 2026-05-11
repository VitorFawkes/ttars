#!/bin/bash
set -e
SVC=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
ANON=$(grep VITE_SUPABASE_ANON_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
URL="https://szyrzxvlptqqheizyrxu.supabase.co"
SILVIA="0037915f-fdb8-48bf-b31e-207788878b5e"
TRIPS_ORG="b0000000-0000-0000-0000-000000000001"
TRIPS_PIPELINE="c8022522-4a1d-411c-9387-efe03ca725ee"

# Stages do pos_venda
STAGE_PRE_30="1f684773-f8f3-434a-a44d-4994750c41aa"      # Pré-embarque > 30 dias
STAGE_PRE_LT_30="3ce80249-b579-4a9c-9b82-f8569735cea9"   # Pré-embarque < 30 dias
STAGE_EM_VIAGEM="0ebab355-6d0e-4b19-af13-b4b31268275f"   # Em Viagem
STAGE_POS_VIAGEM="2c07134a-cb83-4075-bc86-4750beec9393"  # Pós-viagem

echo "=== Criando contato fake ==="
CONTATO=$(curl -s -X POST "$URL/rest/v1/contatos" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"nome":"TESTE-CONCIERGE","sobrenome":"Demo","email":"demo-concierge@teste.test","telefone":"+5511900000001","org_id":"a0000000-0000-0000-0000-000000000001"}')
CONTATO_ID=$(echo "$CONTATO" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
echo "Contato: $CONTATO_ID"

# Função: cria card e retorna ID
criar_card() {
  local titulo="$1"
  local data_ini="$2"
  local data_fim="$3"
  local valor="$4"
  local stage="$5"
  curl -s -X POST "$URL/rest/v1/cards" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    -d "{\"titulo\":\"$titulo\",\"produto\":\"TRIPS\",\"pessoa_principal_id\":\"$CONTATO_ID\",\"concierge_owner_id\":\"$SILVIA\",\"dono_atual_id\":\"$SILVIA\",\"pipeline_id\":\"$TRIPS_PIPELINE\",\"pipeline_stage_id\":\"$stage\",\"data_viagem_inicio\":\"$data_ini\",\"data_viagem_fim\":\"$data_fim\",\"valor_estimado\":$valor,\"org_id\":\"$TRIPS_ORG\",\"status_comercial\":\"aberto\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])"
}

echo ""
echo "=== Criando 5 cards de teste ==="
ROMA=$(criar_card "[TESTE-CONCIERGE] Família Silva - Roma 5d" "2026-06-12" "2026-06-17" 28400 "$STAGE_PRE_30")
echo "Roma: $ROMA (D+45)"
VENEZA=$(criar_card "[TESTE-CONCIERGE] Casal Lima - Veneza 7d" "2026-05-08" "2026-05-15" 41000 "$STAGE_PRE_LT_30")
echo "Veneza: $VENEZA (D+10)"
PARIS=$(criar_card "[TESTE-CONCIERGE] Pedro Costa - Paris 4d" "2026-04-30" "2026-05-04" 22000 "$STAGE_PRE_LT_30")
echo "Paris: $PARIS (D+2)"
TOKYO=$(criar_card "[TESTE-CONCIERGE] Ana e João - Tokyo 10d" "2026-04-26" "2026-05-06" 62000 "$STAGE_EM_VIAGEM")
echo "Tokyo: $TOKYO (em viagem)"
NY=$(criar_card "[TESTE-CONCIERGE] Família Rocha - NY 6d" "2026-04-17" "2026-04-24" 35500 "$STAGE_POS_VIAGEM")
echo "NY: $NY (pós-viagem)"

# Função: cria atendimento
criar_atd() {
  local card="$1"
  local tipo="$2"
  local cat="$3"
  local source="$4"
  local titulo="$5"
  local prazo="$6"
  local valor="$7"
  local cobrado="$8"

  PAYLOAD=$(python3 -c "
import json
data = {
  'p_card_id': '$card',
  'p_tipo_concierge': '$tipo',
  'p_categoria': '$cat',
  'p_source': '$source',
  'p_titulo': '$titulo',
  'p_responsavel_id': '$SILVIA',
}
if '$prazo' != '':
  data['p_data_vencimento'] = '$prazo'
if '$valor' != '0' and '$valor' != '':
  data['p_valor'] = float('$valor')
if '$cobrado' != '':
  data['p_cobrado_de'] = '$cobrado'
print(json.dumps(data))
")
  curl -s -X POST "$URL/rest/v1/rpc/rpc_criar_atendimento_concierge" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" | tr -d '"'
}

echo ""
echo "=== Criando atendimentos diversificados ==="

# ROMA — futuro, mostra ofertas
echo "Roma:"
A=$(criar_atd "$ROMA" "oferta" "passeio" "cadencia" "Ofertar city tour com guia em português" "2026-06-09T18:00:00Z" "1200" "cliente")
echo "  oferta passeio: $A"
A=$(criar_atd "$ROMA" "oferta" "assento" "cadencia" "Vender upgrade de assento Latam executiva" "2026-06-10T17:00:00Z" "850" "cliente")
echo "  oferta assento: $A"

# VENEZA — esta semana, MIX
echo "Veneza:"
A=$(criar_atd "$VENEZA" "oferta" "passeio" "manual" "Vender passeio gôndola privativa" "2026-05-04T20:00:00Z" "1450" "cliente")
echo "  oferta gôndola: $A"
A=$(criar_atd "$VENEZA" "reserva" "restaurante" "cliente" "Reservar Cipriani sábado 21h" "2026-05-02T18:00:00Z" "" "")
echo "  reserva Cipriani: $A"
A=$(criar_atd "$VENEZA" "suporte" "hotel_contato" "cliente" "Cliente quer trocar tipo de quarto - falar com hotel" "2026-05-01T15:00:00Z" "" "")
echo "  suporte hotel: $A"
A=$(criar_atd "$VENEZA" "operacional" "welcome_letter" "cadencia" "Carta de boas-vindas Belmond Hotel Cipriani" "2026-05-01T17:00:00Z" "" "")
echo "  welcome letter: $A"

# PARIS — VENCIDOS (D+2 do embarque, prazos no passado)
echo "Paris (vencidos):"
A=$(criar_atd "$PARIS" "operacional" "passaporte" "cadencia" "Pedir foto do passaporte do Pedro" "2026-04-22T10:00:00Z" "" "")
echo "  passaporte vencido: $A"
A=$(criar_atd "$PARIS" "operacional" "check_in_oferta" "cadencia" "Oferecer check-in feito por nós" "2026-04-23T14:00:00Z" "" "")
echo "  check-in oferta vencido: $A"

# TOKYO — em viagem, VENCIDOS URGENTES
echo "Tokyo (urgentes em viagem):"
A=$(criar_atd "$TOKYO" "suporte" "hotel_contato" "cliente" "URGENTE: cliente perdeu cartão do quarto - falar com hotel agora" "2026-04-27T14:00:00Z" "" "")
echo "  suporte URGENTE: $A"
A=$(criar_atd "$TOKYO" "suporte" "hotel_contato" "cliente" "Voo interno KIX-NRT atrasou 4h - reorganizar transfer" "2026-04-27T08:00:00Z" "" "")
echo "  suporte voo: $A"
A=$(criar_atd "$TOKYO" "operacional" "check_in_executar" "cadencia" "Check-in voo de retorno JL047" "2026-04-27T20:00:00Z" "" "")
echo "  check-in vencido: $A"

# NY — pós-viagem, alguns CONCLUÍDOS pra mostrar histórico
echo "NY (pós-viagem, mix):"
A=$(criar_atd "$NY" "operacional" "pesquisa_pos" "cadencia" "Pesquisa de feedback Família Rocha" "2026-04-27T15:00:00Z" "" "")
echo "  pesquisa pós (a fazer): $A"

# Cria 2 atendimentos pra Veneza JÁ ACEITOS (mostra valor vendido extra na seção do card e no painel)
echo ""
echo "=== Marcando 2 atendimentos como aceitos (com valor) ==="
A=$(criar_atd "$VENEZA" "oferta" "ingresso" "cadencia" "Vender ingressos Doge's Palace fast-track" "2026-04-25T12:00:00Z" "640" "cliente")
echo "  ingresso (vai ser marcado aceito): $A"
curl -s -X POST "$URL/rest/v1/rpc/rpc_marcar_outcome" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"p_atendimento_id\":\"$A\",\"p_outcome\":\"aceito\",\"p_valor_final\":640,\"p_cobrado_de\":\"cliente\",\"p_observacao\":\"Cliente aceitou via WhatsApp\"}" > /dev/null
echo "  ✓ marcado aceito"

A=$(criar_atd "$ROMA" "oferta" "transfer" "manual" "Transfer privativo aeroporto Fiumicino" "2026-04-26T18:00:00Z" "320" "cliente")
echo "  transfer (vai ser marcado aceito): $A"
curl -s -X POST "$URL/rest/v1/rpc/rpc_marcar_outcome" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"p_atendimento_id\":\"$A\",\"p_outcome\":\"aceito\",\"p_valor_final\":320,\"p_cobrado_de\":\"cliente\",\"p_observacao\":\"Confirmado por mensagem\"}" > /dev/null
echo "  ✓ marcado aceito"

# 1 marcado como FEITO no NY (welcome letter passada)
A=$(criar_atd "$NY" "operacional" "welcome_letter" "cadencia" "Carta de boas-vindas hotel Plaza" "2026-04-15T10:00:00Z" "" "")
curl -s -X POST "$URL/rest/v1/rpc/rpc_marcar_outcome" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"p_atendimento_id\":\"$A\",\"p_outcome\":\"feito\"}" > /dev/null
echo "  ✓ NY welcome letter (feito)"

# Conferir total
echo ""
echo "=== Resumo final ==="
curl -s "$URL/rest/v1/atendimentos_concierge?card_id=in.($ROMA,$VENEZA,$PARIS,$TOKYO,$NY)&select=tipo_concierge,outcome,valor,cobrado_de" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ativos = [r for r in d if not r.get('outcome')]
fechados = [r for r in d if r.get('outcome')]
vendido = sum(r.get('valor') or 0 for r in d if r.get('outcome') == 'aceito' and r.get('cobrado_de') == 'cliente')
print(f'Total: {len(d)} atendimentos')
print(f'Ativos: {len(ativos)} | Fechados: {len(fechados)}')
print(f'R\$ vendido extra: R\$ {vendido:.2f}')
print()
print('IDs dos cards (pra referência):')
for nome, cid in [('Roma', '$ROMA'), ('Veneza', '$VENEZA'), ('Paris', '$PARIS'), ('Tokyo', '$TOKYO'), ('NY', '$NY')]:
  print(f'  {nome}: {cid}')"
