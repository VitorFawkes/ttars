#!/bin/bash
SVC=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
ANON=$(grep VITE_SUPABASE_ANON_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
URL="https://szyrzxvlptqqheizyrxu.supabase.co"
SILVIA="0037915f-fdb8-48bf-b31e-207788878b5e"

# === TEST 12: tarefa órfã do TEST 3 ===
# RPC criou tarefa MAS atendimento falhou no constraint check do tipo
echo "=== TEST 12: tarefa órfã do TEST 3 ==="
echo "Buscando tarefa criada com origem=concierge nos últimos 10min sem atendimento_concierge..."
curl -s "$URL/rest/v1/tarefas?metadata->>origem=eq.concierge&created_at=gte.2026-04-27T20:50:00Z&select=id,titulo,metadata,created_at" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "
import sys, json, urllib.request
tarefas = json.load(sys.stdin)
print(f'Total tarefas concierge nos últimos 10min: {len(tarefas)}')
for t in tarefas:
    cat = t.get('metadata', {}).get('categoria', '?')
    tipo = t.get('metadata', {}).get('tipo_concierge', '?')
    print(f\"  {t['id'][:8]} {t['titulo'][:60]} cat={cat} tipo={tipo}\")"
echo ""
echo "Confronta com atendimentos:"
curl -s "$URL/rest/v1/atendimentos_concierge?created_at=gte.2026-04-27T20:50:00Z&select=tarefa_id" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "
import sys, json
print('IDs de tarefas com atendimento:', [r['tarefa_id'] for r in json.load(sys.stdin)])"

echo ""
echo "=== TEST 13: views ==="
echo "v_meu_dia_concierge (sem RLS = service_role bypassa):"
curl -s "$URL/rest/v1/v_meu_dia_concierge?select=tarefa_id,titulo,categoria,status_apresentacao,dias_pra_embarque,produto&limit=20" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total na view: {len(d)}')
for r in d[:15]:
    print(f\"  {r['titulo'][:50]:50} {r['categoria']:25} {r.get('status_apresentacao','?'):14} dias_emb={r.get('dias_pra_embarque')} prod={r.get('produto')}\")"

echo ""
echo "v_atendimentos_lote (agrupado):"
curl -s "$URL/rest/v1/v_atendimentos_lote?select=*&limit=10" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total grupos: {len(d)}')
for r in d:
    print(f\"  {r['categoria']:20} {r['tipo_concierge']:12} {r['janela_embarque']:18} pendentes={r['total_pendentes']}\")"

echo ""
echo "v_card_concierge_stats:"
curl -s "$URL/rest/v1/v_card_concierge_stats?select=*&limit=10" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total cards com stats: {len(d)}')
for r in d:
    print(f\"  {r['card_id'][:8]} ativos={r.get('ativos',0)} venc={r.get('vencidos',0)} concl={r.get('concluidos',0)} R\$={r.get('valor_vendido_extra',0)} prio={r.get('tipo_prioritario')}\")"

echo ""
echo "=== TEST 14: tarefa órfã quando RPC falha em tipo inválido ==="
# Investigar se RPC roda em transação atômica
echo "Tentando criar de novo com tipo inválido..."
TAREFAS_ANTES=$(curl -s "$URL/rest/v1/tarefas?select=id&card_id=eq.397d5ed5-d789-4b6f-bc93-b2d12bb30fc2" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Tarefas antes: $TAREFAS_ANTES"

curl -s -X POST "$URL/rest/v1/rpc/rpc_criar_atendimento_concierge" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"p_card_id\":\"397d5ed5-d789-4b6f-bc93-b2d12bb30fc2\",\"p_tipo_concierge\":\"FAKE_TIPO\",\"p_categoria\":\"assento\",\"p_source\":\"manual\",\"p_titulo\":\"Atomicidade test\"}" > /tmp/atomicity.txt
echo "Resp: $(cat /tmp/atomicity.txt)"

TAREFAS_DEPOIS=$(curl -s "$URL/rest/v1/tarefas?select=id&card_id=eq.397d5ed5-d789-4b6f-bc93-b2d12bb30fc2" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Tarefas depois: $TAREFAS_DEPOIS"
if [ "$TAREFAS_ANTES" = "$TAREFAS_DEPOIS" ]; then
  echo "✅ TRANSAÇÃO ATÔMICA — não criou tarefa órfã"
else
  echo "❌ BUG: criou tarefa órfã!"
fi
