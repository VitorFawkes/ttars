#!/bin/bash
# ============================================================================
# PreToolUse hook: avisa quando uma função SQL está sendo recriada
#
# Toda vez que o agente grava um .sql com `CREATE OR REPLACE FUNCTION`, o hook
# lista todas as migrations anteriores que já definiram aquela função. Isso
# evita "rebase fantasma" — recriar a função partindo de uma versão antiga e
# sem querer apagar correções recentes (caso real: 20260417 sobrescreveu a
# regra contato_principal_completo de 20260413).
#
# Exit 0 sempre (só avisa, não bloqueia).
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

# Pra cada função, procurar migrations anteriores que a definiram
WARNED=0
for fn in $FUNCS; do
  # Busca migrations anteriores (excluindo o próprio arquivo sendo editado)
  PREVIOUS=$(grep -l -iE "CREATE OR REPLACE FUNCTION[[:space:]]+(public\.)?${fn}[[:space:]]*\(" supabase/migrations/*.sql 2>/dev/null | grep -v "$FILE_PATH" || true)

  if [ -n "$PREVIOUS" ]; then
    if [ "$WARNED" = "0" ]; then
      echo ""
      echo "🔔 AVISO: função(ões) SQL sendo recriada(s). Antes de confirmar, leia as versões anteriores:"
      WARNED=1
    fi
    echo ""
    echo "  → $fn()"
    echo "$PREVIOUS" | sed 's/^/      /'
  fi
done

if [ "$WARNED" = "1" ]; then
  echo ""
  echo "  Risco: se você partiu de uma versão antiga como base, pode ter apagado"
  echo "  correções posteriores sem perceber (exemplo real: email voltou a ser"
  echo "  obrigatório após rebase de 17/04 que ignorou correção de 13/04)."
  echo ""
fi

exit 0