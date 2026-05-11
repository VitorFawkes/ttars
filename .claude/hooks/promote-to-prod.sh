#!/bin/bash
set -euo pipefail

# Promove migration do staging para PRODUÇÃO + smoke test
# Uso: bash .claude/hooks/promote-to-prod.sh supabase/migrations/ARQUIVO.sql

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../.." || exit 1
set -a
source .env 2>/dev/null || { echo "Erro: .env não encontrado" >&2; exit 1; }
set +a

SQL_FILE="${1:?Uso: promote-to-prod.sh <arquivo.sql>}"
if [ ! -f "$SQL_FILE" ]; then
  echo "Erro: Arquivo não encontrado: $SQL_FILE" >&2
  exit 1
fi

echo "=== PROMOÇÃO PARA PRODUÇÃO ==="
echo "Arquivo: $SQL_FILE"
echo "Banco: szyrzxvlptqqheizyrxu (PRODUÇÃO)"
echo ""

# Aplicar no banco de produção
python3 -c "
import json,subprocess,os
sql = open('$SQL_FILE').read()
r = subprocess.run(['curl','-sS','-X','POST',
  'https://api.supabase.com/v1/projects/szyrzxvlptqqheizyrxu/database/query',
  '-H','Authorization: Bearer '+os.environ['SUPABASE_ACCESS_TOKEN'],
  '-H','Content-Type: application/json',
  '-d',json.dumps({'query':sql})], capture_output=True, text=True)
print(r.stdout[:500])
if r.returncode != 0:
    print('STDERR:', r.stderr[:300])
    exit(1)
"

# Teste de regras de negócio (BEGIN/ROLLBACK — não persiste dados)
echo ""
echo "Rodando teste de regras de negócio contra produção..."
if ! bash "$SCRIPT_DIR/test-business-rules.sh" prod; then
  echo ""
  echo "ATENÇÃO: regras de negócio divergiram do esperado. Verifique antes de confirmar." >&2
  echo "A mudança FOI APLICADA em produção — revise e decida se é intencional ou precisa corrigir." >&2
  exit 1
fi

# Smoke test contra produção
echo ""
echo "Rodando smoke test contra produção..."
SMOKE_URL="$VITE_SUPABASE_URL" \
SMOKE_ANON="$VITE_SUPABASE_ANON_KEY" \
SMOKE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
bash "$SCRIPT_DIR/schema-smoke-test.sh"

# Registrar no migration log (tracking por arquivo)
LOG_FILE="$SCRIPT_DIR/../.migration_log"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | $SQL_FILE | applied_to_prod" >> "$LOG_FILE"

# Manter marker booleano para backward compat
touch "$SCRIPT_DIR/../.migration_applied"

echo ""
echo "Promoção concluída e registrada em .claude/.migration_log"
