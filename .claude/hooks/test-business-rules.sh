#!/bin/bash
set -euo pipefail

# ============================================================================
# Business Rules Test Runner
#
# Roda .claude/hooks/business-rules.test.sql contra produção (default) ou
# staging. O SQL envelopa tudo em BEGIN/ROLLBACK — nenhum dado persiste.
#
# Por que produção: staging frequentemente está defasado (sem colunas novas)
# e a transação com ROLLBACK garante que nada muda no banco.
#
# Uso:
#   bash .claude/hooks/test-business-rules.sh           # roda em produção
#   bash .claude/hooks/test-business-rules.sh staging   # roda em staging
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

TEST_FILE="$SCRIPT_DIR/business-rules.test.sql"
if [ ! -f "$TEST_FILE" ]; then
  echo "Erro: $TEST_FILE não encontrado" >&2
  exit 1
fi

echo "=== TESTE DE REGRAS DE NEGÓCIO ==="
echo "Banco: $PROJECT_REF ($ENV_LABEL)"
echo ""

# Executar via Python (mais limpo que encadear curl+jq em bash)
set +e
OUTPUT=$(ACCESS_TOKEN="$ACCESS_TOKEN" PROJECT_REF="$PROJECT_REF" TEST_FILE="$TEST_FILE" python3 <<'PYEOF'
import json, subprocess, os, sys, re

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

# Sucesso: resposta é uma lista (mesmo que vazia) — ex: "[]"
try:
    parsed = json.loads(body)
except Exception:
    print('PARSE_ERROR: resposta inválida:', file=sys.stderr)
    print(body[:2000], file=sys.stderr)
    sys.exit(2)

# Sucesso: DO block roda sem exceção, ROLLBACK executa, API retorna lista vazia
if isinstance(parsed, list):
    print('PASS')
    sys.exit(0)

# Erro: API retorna dict com message/code/details
if isinstance(parsed, dict):
    msg = parsed.get('message', '')
    # Nosso marker de falha de regra
    if 'BUSINESS_RULES_TESTS_FAILED' in msg:
        print('REGRA_FAIL', file=sys.stderr)
        print(msg, file=sys.stderr)
        sys.exit(1)
    # Outro erro (schema, fixture, conexão)
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
    echo "OK — regras de negócio validadas."
    exit 0
    ;;
  1)
    echo ""
    echo "REGRA DE NEGÓCIO DIVERGENTE — algo mudou e o comportamento não é mais o esperado." >&2
    exit 1
    ;;
  2)
    echo ""
    echo "Falha de setup (schema/fixture/conexão) — não é regressão de regra, mas o teste não rodou." >&2
    exit 2
    ;;
esac