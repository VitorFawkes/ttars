#!/usr/bin/env bash
# Rollback automático via Vercel API.
#
# Promove o deployment READY anterior ao atual para "production" alias.
# Usado pelo workflow smoke-prod.yml quando o smoke test pós-deploy falha.
#
# Requer:
#   VERCEL_TOKEN           — token com escopo no projeto
#   VERCEL_PROJECT_ID      — id do projeto
#   VERCEL_TEAM_ID         — id do time (opcional, se projeto for de time)
#
# Uso:
#   bash scripts/vercel-rollback.sh
#
# Exit codes:
#   0 — rollback executado com sucesso
#   1 — erro (sem deployment anterior, API falhou, etc)

set -euo pipefail

: "${VERCEL_TOKEN:?VERCEL_TOKEN obrigatório}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID obrigatório}"

TEAM_QUERY=""
if [ -n "${VERCEL_TEAM_ID:-}" ]; then
  TEAM_QUERY="&teamId=${VERCEL_TEAM_ID}"
fi

API="https://api.vercel.com"

echo "→ Buscando últimos deployments de produção..."
DEPLOYMENTS_JSON=$(curl -fsSL \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  "${API}/v6/deployments?projectId=${VERCEL_PROJECT_ID}&target=production&state=READY&limit=10${TEAM_QUERY}")

# Segundo deployment READY = o anterior ao atual
PREV_DEPLOYMENT=$(echo "$DEPLOYMENTS_JSON" | python3 -c '
import json, sys
data = json.load(sys.stdin)
deps = data.get("deployments", [])
if len(deps) < 2:
    sys.exit("ERRO: menos de 2 deployments READY encontrados — nada a reverter")
prev = deps[1]
print(json.dumps({
    "uid": prev.get("uid"),
    "url": prev.get("url"),
    "created": prev.get("created"),
    "meta_sha": (prev.get("meta") or {}).get("githubCommitSha", ""),
}))
')

PREV_UID=$(echo "$PREV_DEPLOYMENT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["uid"])')
PREV_URL=$(echo "$PREV_DEPLOYMENT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"])')

echo "→ Deployment anterior: ${PREV_UID} (${PREV_URL})"
echo "→ Promovendo para production..."

PROMOTE_RESP=$(curl -fsSL -X POST \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  -H "Content-Type: application/json" \
  "${API}/v10/projects/${VERCEL_PROJECT_ID}/promote/${PREV_UID}?${TEAM_QUERY#&}")

echo "→ Rollback concluído."
echo "Deployment ativo em produção: https://${PREV_URL}"
echo "$PROMOTE_RESP" | python3 -m json.tool 2>/dev/null || echo "$PROMOTE_RESP"
