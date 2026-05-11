#!/bin/bash
# ============================================================================
# PreToolUse hook: avisa OU bloqueia quando função SQL está sendo recriada
#
# Toda vez que o agente grava um .sql com `CREATE OR REPLACE FUNCTION`, o hook
# lista todas as migrations anteriores que já definiram aquela função. Isso
# evita "rebase fantasma" — recriar a função partindo de uma versão antiga e
# sem querer apagar correções recentes (caso real: 20260417 sobrescreveu a
# regra contato_principal_completo de 20260413).
#
# Comportamento (CLAUDE.md §TOP 5 #5):
#   - 0 migrations anteriores tocam essa função → exit 0 silencioso
#   - 1 migration anterior  → exit 0 com warn (rebase legítimo de feature recente)
#   - ≥2 migrations anteriores → exit 2 BLOQUEIO (alto risco de reverter
#     correções incrementais; agente DEVE reler cada uma antes de salvar)
# ============================================================================

set -euo pipefail

# Cwd: root do projeto (Claude Code chama do root)
INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  ti = d.get('tool_input', {})
  print(ti.get('file_path', ''))
except Exception:
  pass
")

# Só reage a .sql
case "$FILE_PATH" in
  *.sql) ;;
  *) exit 0 ;;
esac

CONTENT=$(echo "$INPUT" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  ti = d.get('tool_input', {})
  # Write usa 'content', Edit usa 'new_string', MultiEdit usa 'edits[].new_string'
  out = []
  if 'content' in ti: out.append(ti['content'])
  if 'new_string' in ti: out.append(ti['new_string'])
  if 'edits' in ti:
    for e in ti['edits']:
      if 'new_string' in e: out.append(e['new_string'])
  print('\\n'.join(out))
except Exception:
  pass
")

# Extrai nomes das funções sendo criadas/recriadas (ignora esquema prefix)
FUNCS=$(echo "$CONTENT" | grep -oiE 'CREATE OR REPLACE FUNCTION[[:space:]]+(public\.)?[a-zA-Z_][a-zA-Z0-9_]*' | awk '{print $NF}' | sed 's/^public\.//' | sort -u)

if [ -z "$FUNCS" ]; then
  exit 0
fi

# Pra cada função, procurar migrations anteriores que a definiram.
# Acumula contador máximo de migrations anteriores por função.
MAX_PREV_COUNT=0
WARN_OUTPUT=""
for fn in $FUNCS; do
  PREVIOUS=$(grep -l -iE "CREATE OR REPLACE FUNCTION[[:space:]]+(public\.)?${fn}[[:space:]]*\(" supabase/migrations/*.sql 2>/dev/null | grep -v "$FILE_PATH" || true)

  if [ -n "$PREVIOUS" ]; then
    PREV_COUNT=$(echo "$PREVIOUS" | wc -l | tr -d ' ')
    if [ "$PREV_COUNT" -gt "$MAX_PREV_COUNT" ]; then
      MAX_PREV_COUNT=$PREV_COUNT
    fi
    WARN_OUTPUT="${WARN_OUTPUT}
  → ${fn}()  (${PREV_COUNT} migration(s) anterior(es)):
$(echo "$PREVIOUS" | sed 's/^/      /')"
  fi
done

if [ "$MAX_PREV_COUNT" = "0" ]; then
  exit 0
fi

# Stream destino: stderr para warn (Claude vê), stdout para info
if [ "$MAX_PREV_COUNT" -ge 2 ]; then
  # BLOQUEIO — ≥2 migrations anteriores tocam essa função, alto risco de reverter correções
  echo "" >&2
  echo "🚫 BLOQUEADO: função(ões) SQL recriada(s) com $MAX_PREV_COUNT+ migrations anteriores." >&2
  echo "$WARN_OUTPUT" >&2
  echo "" >&2
  echo "  Por quê: recriar função cego com ≥2 migrations anteriores tem alto risco" >&2
  echo "  de reverter correções incrementais. Caso real: email voltou a ser obrigatório" >&2
  echo "  em 17/04/2026 após rebase de uma migration de 13/04 que tinha consertado." >&2
  echo "" >&2
  echo "  ANTES de salvar, releia CADA migration anterior listada acima e confirme" >&2
  echo "  que sua nova versão preserva todas as correções aplicadas." >&2
  echo "" >&2
  echo "  Veja: CLAUDE.md §TOP 5 #5 + memory/feedback_function_rebase_cuidado.md" >&2
  echo "" >&2
  exit 2
fi

# Apenas 1 migration anterior — warn but allow
echo "" >&2
echo "🔔 AVISO: função(ões) SQL sendo recriada(s). Antes de confirmar, leia a versão anterior:" >&2
echo "$WARN_OUTPUT" >&2
echo "" >&2
echo "  Risco baixo (1 migration anterior), mas confirme que sua nova versão" >&2
echo "  preserva o que estava lá." >&2
echo "" >&2
exit 0