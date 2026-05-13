#!/bin/bash
# ============================================================================
# PreToolUse hook: bloqueia listagens de tabela por-org sem .eq('org_id', ...)
#
# Regra (CLAUDE.md §TOP 5 #1 + memory/feedback_workspace_isolation_always.md):
#   Toda listagem (.from('tabela').select(...)) de tabela por-org DEVE filtrar
#   explicitamente por org_id, senão vaza dados cross-workspace via RLS
#   permissiva.
#
# Detecta padrão `.from('TABELA_PORORG')` em src/**/*.{ts,tsx} sem filtro
# adequado nas linhas seguintes — exceto:
#   - .eq('org_id', ...)                           (filtro explícito)
#   - .eq('id', X).single()/.maybeSingle()         (lookup por PK)
#   - .in('id', ids)                               (lookup por chaves)
#   - .rpc(...)                                    (SECURITY DEFINER)
#   - mutations (.insert/.update/.delete/.upsert)  (RLS valida org_id)
#   - .eq('card_id'|'pipeline_id'|'team_id'|...)   (FK que isola implicit.)
#   - Arquivos em src/pages/platform/              (admin de plataforma)
#   - Arquivos em src/pages/admin/studio/          (Pipeline Studio)
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

# Só reage a .ts/.tsx em src/
case "$FILE_PATH" in
  */src/*.ts|*/src/*.tsx) ;;
  *) exit 0 ;;
esac

# Exceções por path: queries cross-org legítimas
case "$FILE_PATH" in
  */src/pages/platform/*) exit 0 ;;
  */src/pages/admin/studio/*) exit 0 ;;
esac

# Extrai conteúdo a ser gravado (junta content/new_string/edits)
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

# Análise via Python — passa CONTENT via env var (evita conflito stdin/programa)
TABLES_REGEX='teams|departments|motivos_perda|card_tags|cadence_templates|cadence_steps|cadence_event_triggers|ai_agents|ai_knowledge_bases|automation_flows|pipelines|pipeline_stages|pipeline_phases|sections|stage_field_config|stage_section_config|section_field_config|stage_field_confirmations|cadence_instances|ai_agent_kb_links|roles|products'

VIOLATIONS=$(HOOK_CONTENT="$CONTENT" HOOK_TABLES="$TABLES_REGEX" python3 <<'PY'
import os, re, sys

content = os.environ.get('HOOK_CONTENT', '')
tables_regex = os.environ.get('HOOK_TABLES', '')
if not content or not tables_regex:
    sys.exit(0)

lines = content.split('\n')
# Aceita whitespace e/ou comentário /* ... */ entre a aspa fechando e o ),
# pra não ser burlado por `.from('teams' /* comentário */)`.
from_pattern = re.compile(r"\.from\((['\"])(" + tables_regex + r")\1\s*(?:/\*[^*]*(?:\*(?!/)[^*]*)*\*/\s*)?\)")
violations = []

for i, line in enumerate(lines):
    m = from_pattern.search(line)
    if not m:
        continue
    table = m.group(2)
    # Pega bloco: linha atual + próximas 25 linhas (até 2 linhas em branco consecutivas ou ; final)
    block_lines = []
    blank_count = 0
    for j in range(i, min(i + 25, len(lines))):
        ln = lines[j]
        block_lines.append(ln)
        if ln.strip() == '':
            blank_count += 1
            if blank_count >= 2:
                break
        else:
            blank_count = 0
        stripped = ln.rstrip()
        if j > i and stripped.endswith(';'):
            break
    block = '\n'.join(block_lines)

    # Filtros de "OK" (em ordem)
    if re.search(r"\.eq\(\s*['\"]org_id['\"]", block):
        continue
    if re.search(r"\.eq\(\s*['\"]id['\"]\s*,", block) and re.search(r"\.(single|maybeSingle)\(", block):
        continue
    if re.search(r"\.in\(\s*['\"]id['\"]\s*,", block):
        continue
    if re.search(r"\.rpc\(", block):
        continue
    if re.search(r"\.(insert|update|delete|upsert)\(", block):
        continue
    if re.search(r"\.eq\(\s*['\"](card_id|pipeline_id|team_id|user_id|contato_id|stage_id|phase_id)['\"]", block):
        continue

    violations.append((i + 1, table, line.strip()[:120]))

for v in violations:
    print(f"{v[0]}|{v[1]}|{v[2]}")
PY
)

if [ -z "$VIOLATIONS" ]; then
  exit 0
fi

FIRST_TABLE=$(echo "$VIOLATIONS" | head -1 | cut -d'|' -f2)

echo "" >&2
echo "🚫 BLOQUEADO: listagem de tabela por-org SEM .eq('org_id', activeOrgId)" >&2
echo "   Arquivo: $FILE_PATH" >&2
echo "" >&2
echo "$VIOLATIONS" | while IFS='|' read -r linenum table preview; do
  echo "   linha $linenum:  .from('$table')  →  $preview" >&2
done
echo "" >&2
echo "Por quê: RLS de algumas tabelas é permissiva (deixa ler workspace + account pai)." >&2
echo "Sem .eq('org_id', activeOrgId), o usuário em Welcome Trips vê dados de Welcome Group, Weddings e Courses." >&2
echo "" >&2
echo "Como corrigir:" >&2
echo "   const { org } = useOrg()" >&2
echo "   const activeOrgId = org?.id" >&2
echo "   supabase.from('$FIRST_TABLE')" >&2
echo "     .select('*').eq('org_id', activeOrgId)" >&2
echo "" >&2
echo "Exceções legítimas (este hook não bloqueia):" >&2
echo "  • src/pages/platform/* (admin de plataforma)" >&2
echo "  • src/pages/admin/studio/* (Pipeline Studio)" >&2
echo "  • Lookups por .eq('id', X).single() ou .in('id', ids) (RLS isola)" >&2
echo "  • Chamadas .rpc(...) (SECURITY DEFINER já filtra)" >&2
echo "  • Mutations .insert/.update/.delete/.upsert (RLS valida org_id)" >&2
echo "" >&2
echo "Veja: CLAUDE.md §TOP 5 #1 + memory/feedback_workspace_isolation_always.md" >&2
echo "" >&2
exit 2
