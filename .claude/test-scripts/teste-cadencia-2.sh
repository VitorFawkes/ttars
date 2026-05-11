#!/bin/bash
SVC=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
ANON=$(grep VITE_SUPABASE_ANON_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
URL="https://szyrzxvlptqqheizyrxu.supabase.co"
NY="99f862b4-19b5-49f8-87c2-66b309e99cc3"
TEMPLATE_ID="4a1dfa03-2677-4e72-b680-b256eb42800a"  # Welcome letter D-7

# Limpar instância antiga + tarefas órfãs
curl -s -X DELETE "$URL/rest/v1/cadence_instances?card_id=eq.$NY&template_id=eq.$TEMPLATE_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SVC"

echo "=== Iniciar cadência via action 'start_cadence' ==="
curl -s -X POST "$URL/functions/v1/cadence-engine" \
  -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" \
  -d "{\"action\":\"start_cadence\",\"card_id\":\"$NY\",\"template_id\":\"$TEMPLATE_ID\"}" | python3 -m json.tool

sleep 3

echo ""
echo "=== Tarefas criadas ==="
curl -s "$URL/rest/v1/tarefas?card_id=eq.$NY&select=id,titulo,tipo,data_vencimento,metadata,created_at&order=created_at.desc&limit=3" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool

echo ""
echo "=== Atendimentos concierge linkados via cadence_step_id ==="
curl -s "$URL/rest/v1/atendimentos_concierge?card_id=eq.$NY&cadence_step_id=not.is.null&select=id,tipo_concierge,categoria,source,cadence_step_id,origem_descricao,tarefa_id" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool

echo ""
echo "=== Confere linkagem (tarefa+complemento) ==="
curl -s "$URL/rest/v1/atendimentos_concierge?card_id=eq.$NY&select=id,tarefa_id,categoria,tarefas(titulo,data_vencimento,metadata)&order=created_at.desc&limit=3" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool
