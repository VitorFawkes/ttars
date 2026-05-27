#!/bin/bash
# Reseta o estado da Patricia pro próximo cenário sem deletar dados.

set -euo pipefail
source .env

PHONE="5511964293533"
AGENT_ID="4d96d9b4-e909-4441-bd85-d3f807cccfa7"
BASE="https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1"

# 1. Archive conversas ativas da linha Patrícia
curl -s -X PATCH "${BASE}/ai_conversations?status=eq.active&phone_number_id=eq.fe26b171-81b5-4622-8d77-aa5bf102d781" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "archived"}' > /dev/null

CONTACT_IDS_JSON=$(curl -s "${BASE}/contatos?select=id&telefone=eq.${PHONE}" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
CONTACT_IDS=$(echo "$CONTACT_IDS_JSON" | jq -r '.[].id' | paste -sd ',' -)

if [ -n "$CONTACT_IDS" ]; then
  # 2. Despausa cards + limpa produto_data (zera Europa/orçamento/convidados do teste anterior)
  curl -s -X PATCH "${BASE}/cards?pessoa_principal_id=in.(${CONTACT_IDS})&produto=eq.WEDDING" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"ai_pause_config": null, "produto_data": {}}' > /dev/null

  # 3. Limpa nome de TODOS contatos com este telefone (vai forçar Patrícia perguntar)
  curl -s -X PATCH "${BASE}/contatos?id=in.(${CONTACT_IDS})" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"nome": ""}' > /dev/null
fi

# 4. Buffer
curl -s -X DELETE "${BASE}/ai_message_buffer?contact_phone=eq.${PHONE}" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > /dev/null

echo "✓ Reset: conversa archived, cards despausados, nomes zerados, buffer limpo"
