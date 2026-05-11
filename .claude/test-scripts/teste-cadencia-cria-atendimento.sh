#!/bin/bash
set -e
SVC=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
ANON=$(grep VITE_SUPABASE_ANON_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
URL="https://szyrzxvlptqqheizyrxu.supabase.co"
NY="99f862b4-19b5-49f8-87c2-66b309e99cc3"  # card de teste pós-viagem

# 1) Pegar template "Concierge: Welcome letter D-7"
TEMPLATE_ID=$(curl -s "$URL/rest/v1/cadence_templates?name=eq.Concierge:%20Welcome%20letter%20D-7&select=id" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
echo "Template Welcome letter: $TEMPLATE_ID"

# 2) Confirmar step tem flag concierge
STEP=$(curl -s "$URL/rest/v1/cadence_steps?template_id=eq.$TEMPLATE_ID&select=id,gera_atendimento_concierge,tipo_concierge,categoria_concierge,task_config" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool)
echo "Step:"
echo "$STEP"

# 3) Ativar template
curl -s -X PATCH "$URL/rest/v1/cadence_templates?id=eq.$TEMPLATE_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d '{"is_active":true}'
echo "✓ Ativado"

# 4) Criar instância de cadência manualmente (simulando trigger)
echo ""
echo "=== Criar instância ==="
INSTANCE_RESP=$(curl -s -X POST "$URL/rest/v1/cadence_instances" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"card_id\":\"$NY\",\"template_id\":\"$TEMPLATE_ID\",\"status\":\"active\",\"started_at\":\"2026-04-28T15:00:00Z\",\"org_id\":\"b0000000-0000-0000-0000-000000000001\"}")
INSTANCE_ID=$(echo "$INSTANCE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) else 'ERR: '+str(d))")
echo "Instance: $INSTANCE_ID"

# 5) Invocar cadence-engine pra processar
echo ""
echo "=== Invocar cadence-engine ==="
curl -s -X POST "$URL/functions/v1/cadence-engine" \
  -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"process_instance\",\"instance_id\":\"$INSTANCE_ID\"}" | head -c 500
echo ""

# 6) Verificar se tarefa foi criada
echo ""
echo "=== Tarefas criadas no card NY ==="
sleep 2
curl -s "$URL/rest/v1/tarefas?card_id=eq.$NY&metadata->>cadence_instance_id=eq.$INSTANCE_ID&select=id,titulo,tipo,data_vencimento,metadata" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool

# 7) Verificar se atendimento_concierge foi criado linkado
echo ""
echo "=== Atendimento concierge criado? ==="
curl -s "$URL/rest/v1/atendimentos_concierge?card_id=eq.$NY&cadence_step_id=neq.null&select=id,tipo_concierge,categoria,source,cadence_step_id,origem_descricao" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -m json.tool

# 8) Cleanup: desativar template
echo ""
echo "=== Cleanup: desativar template ==="
curl -s -X PATCH "$URL/rest/v1/cadence_templates?id=eq.$TEMPLATE_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d '{"is_active":false}'
echo "✓ Desativado"
