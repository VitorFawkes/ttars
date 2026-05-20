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

# SUPABASE_ACCESS_TOKEN (org-wide) tem acesso a todos os projetos da org,
# inclusive staging. Fallback para STAGING_ACCESS_TOKEN caso o primeiro não exista.
TOKEN="${SUPABASE_ACCESS_TOKEN:-${STAGING_ACCESS_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "Erro: nem SUPABASE_ACCESS_TOKEN nem STAGING_ACCESS_TOKEN definidos no .env" >&2
  exit 1
fi

python3 -c "
import json,subprocess,sys
sql = open('$SQL_FILE').read()
r = subprocess.run(['curl','-sS','-w','\nHTTP:%{http_code}','-X','POST',
  'https://api.supabase.com/v1/projects/ivmebyvjarcvrkrbemam/database/query',
  '-H','Authorization: Bearer $TOKEN',
  '-H','Content-Type: application/json',
  '-d',json.dumps({'query':sql})], capture_output=True, text=True)
out = r.stdout
http_code = out.rsplit('HTTP:', 1)[-1].strip() if 'HTTP:' in out else 'unknown'
body = out.rsplit('HTTP:', 1)[0][:600]
print('Resposta:', body)
print('HTTP:', http_code)
if r.returncode != 0 or http_code not in ('200','201'):
    print('STDERR:', r.stderr[:300])
    sys.exit(1)
"

echo ""
echo "Aplicado no staging. Teste com 'npm run dev' antes de promover para produção."
