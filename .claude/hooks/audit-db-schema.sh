#!/bin/bash
set -euo pipefail

# Introspecção do banco de produção — salva estado real em .claude/db-audit/
# Uso: bash .claude/hooks/audit-db-schema.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../.." || exit 1
set -a
source .env 2>/dev/null || { echo "Erro: .env não encontrado" >&2; exit 1; }
set +a

OUTPUT_DIR=".claude/db-audit"
mkdir -p "$OUTPUT_DIR"

PROJECT_REF="szyrzxvlptqqheizyrxu"
API_URL="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"

run_query() {
  local name="$1"
  local sql="$2"
  local outfile="$OUTPUT_DIR/${name}.json"

  echo "  Consultando: $name..."
  result=$(curl -sS -X POST "$API_URL" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c "import json; print(json.dumps({'query': '''$sql'''}))")")

  echo "$result" > "$outfile"

  # Verificar se é JSON válido e contar registros
  count=$(python3 -c "
import json, sys
try:
    data = json.loads(open('$outfile').read())
    if isinstance(data, list):
        print(len(data))
    else:
        print('error: ' + str(data)[:200])
except Exception as e:
    print('parse_error: ' + str(e)[:200])
" 2>/dev/null)
  echo "    → $count registros"
}

echo "=== AUDITORIA DO BANCO DE PRODUÇÃO ==="
echo "Projeto: $PROJECT_REF"
echo ""

# 1. Tabelas
run_query "tables" "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"

# 2. Colunas
run_query "columns" "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position"

# 3. Functions com definição
run_query "functions" "SELECT p.proname AS function_name, pg_get_function_arguments(p.oid) AS arguments, pg_get_function_result(p.oid) AS return_type FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' ORDER BY p.proname"

# 4. Views
run_query "views" "SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname"

# 5. Triggers
run_query "triggers" "SELECT trigger_name, event_object_table, action_timing, event_manipulation FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY event_object_table, trigger_name"

# 6. Indexes
run_query "indexes" "SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname"

# 7. Enums
run_query "enums" "SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder"

# 8. RLS Policies
run_query "policies" "SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname"

echo ""
echo "=== Auditoria concluída. Resultados em $OUTPUT_DIR/ ==="
ls -la "$OUTPUT_DIR/"