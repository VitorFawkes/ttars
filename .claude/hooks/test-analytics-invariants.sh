#!/bin/bash
set -euo pipefail

# ============================================================================
# Analytics Invariants Test Runner
#
# Roda .claude/hooks/analytics-invariants.test.sql contra produção (default)
# ou staging. O SQL roda em BEGIN/ROLLBACK — read-only, nenhum dado persiste.
#
# Cobertura: 4 invariantes críticas do Analytics-Weddings.
#
# Uso:
#   bash .claude/hooks/test-analytics-invariants.sh           # produção
#   bash .claude/hooks/test-analytics-invariants.sh staging   # staging
#
# Integração: chamado por promote-to-prod.sh antes do smoke test.
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../.." || exit 1
set -a
source .env 2>/dev/null || { echo "Erro: .env não encontrado" >&2; exit 1; }
set +a

TARGET="${1:-prod}"
case "$TARGET" in
  prod|production)
    PROJECT_REF="szyrzxvlptqqheizyrxu"
    ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
    ENV_LABEL="PRODUÇÃO (rollback)"
    ;;
  staging)
    PROJECT_REF="ivmebyvjarcvrkrbemam"
    ACCESS_TOKEN="${STAGING_ACCESS_TOKEN:-}"
    ENV_LABEL="staging"
    ;;
  *)
    echo "Uso: $0 [prod|staging]" >&2
    exit 2
    ;;
esac

if [ -z "$ACCESS_TOKEN" ]; then
  echo "Erro: access token não disponível pra $TARGET" >&2
  exit 2
fi

TEST_FILE="$SCRIPT_DIR/analytics-invariants.test.sql"
if [ ! -f "$TEST_FILE" ]; then
  echo "Erro: $TEST_FILE não encontrado" >&2
  exit 1
fi

echo "=== ANALYTICS-WEDDINGS INVARIANTES ==="
echo "Banco: $PROJECT_REF ($ENV_LABEL)"
echo ""

set +e
OUTPUT=$(ACCESS_TOKEN="$ACCESS_TOKEN" PROJECT_REF="$PROJECT_REF" TEST_FILE="$TEST_FILE" python3 <<'PYEOF'
import json, subprocess, os, sys

sql = open(os.environ['TEST_FILE']).read()
r = subprocess.run(
    ['curl', '-sS', '-X', 'POST',
     f'https://api.supabase.com/v1/projects/{os.environ["PROJECT_REF"]}/database/query',
     '-H', 'Authorization: Bearer ' + os.environ['ACCESS_TOKEN'],
     '-H', 'Content-Type: application/json',
     '-d', json.dumps({'query': sql})],
    capture_output=True, text=True)

if r.returncode != 0:
    print('CURL_ERROR', file=sys.stderr)
    print(r.stderr[:500], file=sys.stderr)
    sys.exit(2)

body = r.stdout
try:
    parsed = json.loads(body)
except Exception:
    print('PARSE_ERROR: resposta inválida:', file=sys.stderr)
    print(body[:2000], file=sys.stderr)
    sys.exit(2)

# Sucesso: ROLLBACK → API retorna lista vazia
if isinstance(parsed, list):
    print('PASS')
    sys.exit(0)

if isinstance(parsed, dict):
    msg = parsed.get('message', '')
    if 'ANALYTICS_INVARIANTS_FAILED' in msg:
        print('INVARIANT_FAIL', file=sys.stderr)
        print(msg, file=sys.stderr)
        sys.exit(1)
    print('SETUP_FAIL', file=sys.stderr)
    print(f"  message: {msg[:800]}", file=sys.stderr)
    if 'hint' in parsed:
        print(f"  hint: {parsed['hint']}", file=sys.stderr)
    sys.exit(2)

print('UNKNOWN_RESPONSE', file=sys.stderr)
print(body[:2000], file=sys.stderr)
sys.exit(2)
PYEOF
)
EXIT=$?
set -e

case "$EXIT" in
  0)
    echo "OK — 4 invariantes validadas."
    exit 0
    ;;
  1)
    echo ""
    echo "FALHA — uma ou mais invariantes quebraram. Veja stderr acima." >&2
    echo "Ação: investigar a causa raiz ANTES de promover. Não comente os testes." >&2
    exit 1
    ;;
  *)
    echo ""
    echo "ERRO de setup — não foi possível executar os testes." >&2
    echo "Provável: ACCESS_TOKEN inválido, função RPC removida, ou schema regrediu." >&2
    exit 2
    ;;
esac
