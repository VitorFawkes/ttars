#!/bin/bash
# Envia uma mensagem como se fosse o lead 5511964293533, espera resposta da Patricia,
# captura turno completo (mensagens, tools, validator, tokens, duration).
# Uso: ./test-patricia.sh "texto da mensagem" [wait_seconds]

set -euo pipefail
source .env

MSG="${1:-}"
WAIT="${2:-18}"
if [ -z "$MSG" ]; then
  echo "Uso: $0 \"mensagem do lead\" [wait_seconds=18]"
  exit 1
fi

PHONE="5511964293533"
PHONE_NUMBER_ID="fe26b171-81b5-4622-8d77-aa5bf102d781"
AGENT_ID="4d96d9b4-e909-4441-bd85-d3f807cccfa7"
PROJECT_REF="szyrzxvlptqqheizyrxu"

echo "" >&2
echo "▶ LEAD: $MSG" >&2

# Dispara mensagem pro router v2
curl -s -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/ai-agent-router-v2" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg t "$MSG" --arg p "$PHONE" --arg pid "$PHONE_NUMBER_ID" '{
    contact_phone: $p,
    message_text: $t,
    phone_number_id: $pid,
    phone_number_label: "Elopment (Patricia v2)",
    message_type: "text"
  }')" > /dev/null

echo "⏳ Aguardando ${WAIT}s (debounce + LLM)..." >&2
sleep "$WAIT"

# Captura último turno do assistant (a resposta da Patrícia)
curl -s "https://${PROJECT_REF}.supabase.co/rest/v1/ai_conversation_turns?select=role,content,skills_used,context_used,current_moment_key,validator_verdict_action,input_tokens,output_tokens,is_fallback,created_at&agent_id=eq.${AGENT_ID}&role=eq.assistant&order=created_at.desc&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq '.[0]'
