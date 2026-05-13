#!/bin/bash
# ============================================================================
# PreToolUse hook: bloqueia migrations que criam policies RLS USING (true)
# para roles authenticated/public em tabelas por-org.
#
# Regra (CLAUDE.md §RLS - regra de ouro):
#   PostgreSQL faz OR entre policies permissivas. Uma USING (true) em paralelo
#   a uma USING (org_id = requesting_org_id()) NEUTRALIZA o isolamento e vaza
#   dados cross-workspace.
#
# Esse hook é o *complemento* PreWrite do audit-rls-leaks.sh (que roda no
# Stop e consulta o banco real). Aqui pegamos ANTES do save — o agente nem
# chega a aplicar a migration errada.
#
# Detecta no CONTEÚDO do .sql sendo gravado:
#   CREATE POLICY ... ON tabela ... TO authenticated|public ... USING (true)
#
# Tabelas genuinamente globais ficam em GLOBAL_ALLOWLIST (mantida em sync com
# audit-rls-leaks.sh). Se você está adicionando uma tabela global nova, edite
# a allowlist no MESMO commit.
#
# Exit 2 (bloqueia) se detectar; exit 0 caso contrário.
# ============================================================================

set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
  pass
")

# Só reage a .sql em supabase/migrations/
case "$FILE_PATH" in
  */supabase/migrations/*.sql) ;;
  *) exit 0 ;;
esac

CONTENT=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  ti = d.get('tool_input', {})
  out = []
  if 'content' in ti: out.append(ti['content'])
  if 'new_string' in ti: out.append(ti['new_string'])
  if 'edits' in ti:
    for e in ti['edits']:
      if 'new_string' in e: out.append(e['new_string'])
  sys.stdout.write('\n'.join(out))
except Exception:
  pass
")

if [ -z "$CONTENT" ]; then
  exit 0
fi

# Parse SQL — buscar CREATE POLICY ... ON tabela ... TO authenticated|public ... USING (true)
VIOLATIONS=$(HOOK_CONTENT="$CONTENT" python3 <<'PY'
import os, re, sys

content = os.environ.get('HOOK_CONTENT', '')
if not content:
    sys.exit(0)

# Tabelas genuinamente globais (manter em sync com audit-rls-leaks.sh GLOBAL_ALLOWLIST)
GLOBAL_ALLOWLIST = {
    'activity_categories', 'integration_field_catalog', 'integration_provider_catalog',
    'integration_health_rules', 'integration_health_pulse', 'integration_outbox',
    'webhook_logs', 'ai_extraction_field_config', 'destinations',
    'organizations', 'org_members', 'platform_audit_log',
    'system_fields',  # per-org seeded — RLS pode parecer global mas é caso especial
}

# Pattern: CREATE POLICY ... ON [schema.]tabela ... TO ... authenticated|public ... USING (true)
# SQL pode ter quebra de linha entre cláusulas. Concatena tudo num só string para regex multiline.
# Mas precisa preservar nomes de policy/tabela.

# Estratégia: dividir por ponto-e-vírgula, processar cada statement
# Remover comentários SQL (-- ... fim de linha e /* ... */)
def strip_comments(sql):
    sql = re.sub(r'--[^\n]*', '', sql)
    sql = re.sub(r'/\*.*?\*/', '', sql, flags=re.DOTALL)
    return sql

content_clean = strip_comments(content)
# Statements
statements = re.split(r';\s*\n', content_clean)

violations = []

policy_re = re.compile(
    r"CREATE\s+POLICY\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)\s+ON\s+(?:public\.)?(\w+)",
    re.IGNORECASE | re.DOTALL
)

for stmt in statements:
    if 'CREATE POLICY' not in stmt.upper():
        continue
    m = policy_re.search(stmt)
    if not m:
        continue
    policy_name = m.group(1).strip('"')
    table_name = m.group(2).strip('"').lower()

    if table_name in GLOBAL_ALLOWLIST:
        continue

    # TO clause: precisa mencionar authenticated ou public
    # FOR clause: ALL | SELECT | INSERT | etc — só queremos SELECT/ALL para SELECT-side leak
    # Mas USING (true) em qualquer cmd que tenha SELECT-side é problema.
    # Para simplicidade: se USING (true) e roles inclui authenticated/public, flag.

    has_authenticated_or_public = bool(re.search(
        r"\bTO\s+(?:[^;]*?\b)?(authenticated|public)\b",
        stmt, re.IGNORECASE | re.DOTALL
    ))
    if not has_authenticated_or_public:
        # Default role é public se não especificado, mas vamos ser conservadores:
        # se não há `TO`, considerar suspeito também
        if not re.search(r"\bTO\s+", stmt, re.IGNORECASE):
            has_authenticated_or_public = True

    if not has_authenticated_or_public:
        continue

    # USING (true) — aceitando whitespace e maiúsculas
    if re.search(r"USING\s*\(\s*true\s*\)", stmt, re.IGNORECASE):
        violations.append((policy_name, table_name))
    # WITH CHECK (true) sem USING não vaza leitura, mas vaza escrita — também flag
    elif re.search(r"WITH\s+CHECK\s*\(\s*true\s*\)", stmt, re.IGNORECASE) and 'INSERT' not in stmt.upper().split('FOR')[1].split('TO')[0] if 'FOR' in stmt.upper() else False:
        # Heurística mais rigorosa: só flagar WITH CHECK(true) quando é UPDATE/ALL
        violations.append((policy_name, table_name))

for v in violations:
    print(f"{v[0]}|{v[1]}")
PY
)

if [ -z "$VIOLATIONS" ]; then
  exit 0
fi

echo "" >&2
echo "🚫 BLOQUEADO: migration cria policy RLS \`USING (true)\` para authenticated/public em tabela por-org" >&2
echo "   Arquivo: $FILE_PATH" >&2
echo "" >&2
echo "$VIOLATIONS" | while IFS='|' read -r policy table; do
  echo "   policy '$policy' em tabela '$table'" >&2
done
echo "" >&2
echo "Por quê: PostgreSQL faz OR entre policies permissivas. Uma USING (true)" >&2
echo "em paralelo a USING (org_id = requesting_org_id()) NEUTRALIZA o isolamento" >&2
echo "e vaza dados cross-workspace." >&2
echo "" >&2
echo "Padrão correto:" >&2
echo "   CREATE POLICY tabela_org_all ON tabela TO authenticated" >&2
echo "     USING (org_id = requesting_org_id())" >&2
echo "     WITH CHECK (org_id = requesting_org_id());" >&2
echo "   CREATE POLICY tabela_service_all ON tabela TO service_role" >&2
echo "     USING (true) WITH CHECK (true);  -- service_role é OK" >&2
echo "" >&2
echo "Se a tabela é GENUINAMENTE global (catálogo compartilhado, sem org_id):" >&2
echo "  1. Adicione o nome em GLOBAL_ALLOWLIST de:" >&2
echo "     • .claude/hooks/audit-rls-leaks.sh" >&2
echo "     • .claude/hooks/enforce-rls-prewrite.sh" >&2
echo "  2. Documente o motivo em COMMENT ON TABLE" >&2
echo "" >&2
echo "Veja: CLAUDE.md §RLS - regra de ouro" >&2
echo "" >&2
exit 2
