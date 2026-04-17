#!/bin/bash
# Hook: Bloqueia deploy de edge functions que devem ter verify_jwt=false
# sem o flag --no-verify-jwt

# Functions que DEVEM ser públicas (recebem webhooks externos sem JWT)
PUBLIC_FUNCTIONS="webhook-ingest webhook-whatsapp whatsapp-webhook active-campaign-webhook integration-sync-deals"

# Extrair o input do hook (JSON via stdin)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('input',{}).get('command',''))" 2>/dev/null)

# Só verificar comandos de deploy
if echo "$COMMAND" | grep -q "supabase functions deploy"; then
  # Extrair o nome da function sendo deployada
  FUNC_NAME=$(echo "$COMMAND" | grep -oE 'functions deploy [a-z0-9_-]+' | awk '{print $3}')

  if [ -z "$FUNC_NAME" ]; then
    exit 0
  fi

  # Verificar se é uma function pública
  for PUBLIC_FN in $PUBLIC_FUNCTIONS; do
    if [ "$FUNC_NAME" = "$PUBLIC_FN" ]; then
      # É pública — verificar se tem --no-verify-jwt
      if ! echo "$COMMAND" | grep -q "\-\-no-verify-jwt"; then
        echo "BLOCKED: A function '$FUNC_NAME' recebe webhooks externos e DEVE ser deployada com --no-verify-jwt"
        echo ""
        echo "Corrija o comando:"
        echo "  npx supabase functions deploy $FUNC_NAME --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu"
        echo ""
        echo "Functions públicas: $PUBLIC_FUNCTIONS"
        exit 2
      fi
    fi
  done
fi

exit 0
