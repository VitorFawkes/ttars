#!/bin/bash
# Guardião do isolamento por workspace.
# Detecta policies RLS `USING (true)` para authenticated/public em tabelas
# por-org — elas neutralizam o `org_id = requesting_org_id()` via OR lógico.
#
# Uso: bash .claude/hooks/audit-rls-leaks.sh
# Saída: 0 se limpo, 2 se detectar leaks (bloqueia Stop hook)
#
# Tabelas realmente globais (sem org_id, por desenho) ficam em GLOBAL_ALLOWLIST.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../.." || exit 1

if [ ! -f .env ]; then
  exit 0
fi
set -a
source .env
set +a

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || [ -z "${VITE_SUPABASE_URL:-}" ]; then
  exit 0
fi

GLOBAL_ALLOWLIST="'activity_categories','integration_field_catalog','integration_provider_catalog','integration_health_rules','system_fields','destinations'"

QUERY=$(cat <<SQL
SELECT tablename, policyname, roles
FROM pg_policies
WHERE schemaname='public'
  AND permissive='PERMISSIVE'
  AND qual='true'
  AND NOT ('service_role'=ANY(roles))
  AND cmd IN ('SELECT','ALL')
  AND tablename NOT IN ($GLOBAL_ALLOWLIST)
ORDER BY tablename, policyname
SQL
)

PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$QUERY")

RESP=$(curl -sS -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/exec_sql" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "$PAYLOAD")

COUNT=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")

if [ "$COUNT" = "0" ]; then
  exit 0
fi

echo "" >&2
echo "BLOQUEADO: $COUNT policy(s) RLS vazando dados entre workspaces:" >&2
echo "$RESP" | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    print(f\"  {p['tablename']}.{p['policyname']} (roles={p['roles']})\", file=sys.stderr)
" >&2
echo "" >&2
echo "Essas policies têm 'USING (true)' e convivem com as org-scoped — o OR" >&2
echo "entre policies permissivas faz o isolamento falhar." >&2
echo "" >&2
echo "Opções:" >&2
echo "  1. DROP POLICY se a tabela já tem coluna org_id e policy *_org_*" >&2
echo "  2. Adicionar org_id na tabela + policy *_org_all antes de dropar" >&2
echo "  3. Se a tabela É genuinamente global, adicionar à GLOBAL_ALLOWLIST" >&2
echo "     em .claude/hooks/audit-rls-leaks.sh" >&2
echo "" >&2
exit 2