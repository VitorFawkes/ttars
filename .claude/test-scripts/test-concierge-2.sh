#!/bin/bash
SVC=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
ANON=$(grep VITE_SUPABASE_ANON_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
URL="https://szyrzxvlptqqheizyrxu.supabase.co"
SILVIA="0037915f-fdb8-48bf-b31e-207788878b5e"
TRIPS_ORG="b0000000-0000-0000-0000-000000000001"

ROMA="397d5ed5-d789-4b6f-bc93-b2d12bb30fc2"
VENEZA="25dac139-3917-4690-8b6e-aeed4e278f5c"

# Atendimentos já criados
ATD_ASSENTO_ROMA="284f44da-bbaf-40a0-8e5c-5e1fc2772ea9"
ATD_PASSEIO_VENEZA="cd79f567-e81a-4bf3-b9e0-8e1e5872edf7"
ATD_RESTAURANTE="f78d3aea-cb3e-4859-8135-618e27cc5478"
ATD_SUPORTE_HOTEL="c410eee0-6e05-4fc6-9922-5b407fdee033"
ATD_WELCOME="d60399bb-f421-4023-87c3-fe2c7775c6cb"
ATD_PASSAPORTE_VENCIDO="a9f407f6-aae9-4905-ad7c-aa6abf68d0c1"
ATD_CHECKIN_VENCIDO="692afe34-7ed8-4a82-b08c-650cbaf907d7"
ATD_PESQUISA="db0dd518-8afb-4c82-b46f-c8257d10aa57"

# === TEST 7: rpc_marcar_outcome ===
echo "=== TEST 7a: marcar outcome=aceito (oferta assento Roma) ==="
RESP=$(curl -s -X POST "$URL/rest/v1/rpc/rpc_marcar_outcome" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"p_atendimento_id\":\"$ATD_ASSENTO_ROMA\",\"p_outcome\":\"aceito\",\"p_valor_final\":800,\"p_cobrado_de\":\"cliente\",\"p_observacao\":\"Cliente aceitou via WhatsApp\"}")
echo "Resp: $RESP"

echo ""
echo "=== TEST 7b: verifica tabela atualizada ==="
curl -s "$URL/rest/v1/atendimentos_concierge?id=eq.$ATD_ASSENTO_ROMA&select=outcome,outcome_em,outcome_por,valor,cobrado_de,payload" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool

echo ""
echo "=== TEST 7c: verifica tarefa atualizada ==="
TAREFA_ID=$(curl -s "$URL/rest/v1/atendimentos_concierge?id=eq.$ATD_ASSENTO_ROMA&select=tarefa_id" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['tarefa_id'])")
curl -s "$URL/rest/v1/tarefas?id=eq.$TAREFA_ID&select=concluida,concluida_em,outcome,resultado,status" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool

echo ""
echo "=== TEST 8: trigger sync — marcar tarefa como concluida diretamente ==="
TAREFA_PASSEIO=$(curl -s "$URL/rest/v1/atendimentos_concierge?id=eq.$ATD_PASSEIO_VENEZA&select=tarefa_id" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['tarefa_id'])")
echo "Tarefa do passeio: $TAREFA_PASSEIO"
curl -s -X PATCH "$URL/rest/v1/tarefas?id=eq.$TAREFA_PASSEIO" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d '{"concluida":true,"concluida_em":"2026-04-27T21:00:00Z","status":"concluida"}'
echo "Verificando se atendimento ganhou outcome_em via trigger:"
curl -s "$URL/rest/v1/atendimentos_concierge?id=eq.$ATD_PASSEIO_VENEZA&select=outcome,outcome_em,outcome_por" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool

echo ""
echo "=== TEST 9: rpc_notificar_cliente ==="
RESP=$(curl -s -X POST "$URL/rest/v1/rpc/rpc_notificar_cliente" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"p_atendimento_id\":\"$ATD_RESTAURANTE\"}")
echo "Resp: $RESP"
curl -s "$URL/rest/v1/atendimentos_concierge?id=eq.$ATD_RESTAURANTE&select=notificou_cliente_em" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool

echo ""
echo "=== TEST 10: rpc_executar_em_lote ==="
RESP=$(curl -s -X POST "$URL/rest/v1/rpc/rpc_executar_em_lote" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"p_atendimento_ids\":[\"$ATD_WELCOME\",\"$ATD_PESQUISA\"],\"p_outcome\":\"feito\",\"p_observacao\":\"Lote teste\"}")
echo "Resp (deve retornar 2): $RESP"
curl -s "$URL/rest/v1/atendimentos_concierge?id=in.($ATD_WELCOME,$ATD_PESQUISA)&select=id,outcome,outcome_em" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool

echo ""
echo "=== TEST 11: trigger sync REVERSO — descompletar tarefa ==="
echo "Antes:"
curl -s "$URL/rest/v1/atendimentos_concierge?id=eq.$ATD_PASSEIO_VENEZA&select=outcome,outcome_em" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool
curl -s -X PATCH "$URL/rest/v1/tarefas?id=eq.$TAREFA_PASSEIO" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d '{"concluida":false,"concluida_em":null,"status":"pendente","outcome":null}'
echo "Depois:"
curl -s "$URL/rest/v1/atendimentos_concierge?id=eq.$ATD_PASSEIO_VENEZA&select=outcome,outcome_em" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool
