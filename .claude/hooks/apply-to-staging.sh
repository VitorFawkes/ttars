#!/bin/bash
set -euo pipefail

# Aplica migration no banco STAGING
# Uso: bash .claude/hooks/apply-to-staging.sh supabase/migrations/ARQUIVO.sql

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../.." || exit 1
set -a
source .env 2>/dev/null || { echo "Erro: .env não encontrado" >&2; exit 1; }
set +a

SQL_FILE="${1:?Uso: apply-to-staging.sh <arquivo.sql>}"
if [ ! -f "$SQL_FILE" ]; then
  echo "Erro: Arquivo não encontrado: $SQL_FILE" >&2
  exit 1
fi

echo "=== APLICANDO NO STAGING ==="
echo "Arquivo: $SQL_FILE"
echo "Banco: ivmebyvjarcvrkrbemam (staging)"
echo ""

python3 -c "
import json,subprocess,os
sql = open('$SQL_FILE').read()
r = subprocess.run(['curl','-sS','-X','POST',
  'https://api.supabase.com/v1/projects/ivmebyvjarcvrkrbemam/database/query',
  '-H','Authorization: Bearer '+os.environ['STAGING_ACCESS_TOKEN'],
  '-H','Content-Type: application/json',
  '-d',json.dumps({'query':sql})], capture_output=True, text=True)
print(r.stdout[:500])
if r.returncode != 0:
    print('STDERR:', r.stderr[:300])
    exit(1)
"

echo ""
echo "Aplicado no staging. Teste com 'npm run dev' antes de promover para produção."
