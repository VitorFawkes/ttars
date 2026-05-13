#!/bin/bash
# ============================================================================
# PreToolUse hook: bloqueia hooks de configuração de pipeline sem pipelineId
#
# Regra (CLAUDE.md §TOP 5 #3 + memory/feedback_metadata_isolation.md):
#   useFieldConfig, useStageSectionConfig, useStageFieldConfirmations,
#   useQualityGate retornam configs por etapa/pipeline. Sem pipelineId, vazam
#   configs cross-pipeline (campos WEDDING aparecem em telas TRIPS).
#
# Detecta chamadas SEM argumento (ex: useFieldConfig(), useFieldConfig() :)
# em arquivos fora de src/pages/admin/studio/ (Pipeline Studio é exceção).
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

# Exceção: Pipeline Studio precisa ver configs de TODOS os pipelines
case "$FILE_PATH" in
  */src/pages/admin/studio/*) exit 0 ;;
  */src/components/admin/studio/*) exit 0 ;;
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

# Detecta chamadas dos 4 hooks sem argumento
VIOLATIONS=$(HOOK_CONTENT="$CONTENT" python3 <<'PY'
import os, re, sys

content = os.environ.get('HOOK_CONTENT', '')
if not content:
    sys.exit(0)

# Hooks proibidos sem argumento (whitelist explícita do CLAUDE.md §Isolamento de Metadados)
HOOKS = ['useFieldConfig', 'useStageSectionConfig', 'useStageFieldConfirmations', 'useQualityGate']

# Pattern: hook seguido de () possivelmente com whitespace E newlines (DOTALL)
# Negative: hook(arg) ou hook( arg ) — qualquer coisa não-whitespace dentro
# DOTALL faz \s casar newlines, pegando chamadas multilinha tipo useFieldConfig(\n)
pattern = re.compile(r'\b(' + '|'.join(HOOKS) + r')\(\s*\)', re.DOTALL)

# Análise: rodar regex contra conteúdo inteiro, mapear offset → linha,
# aplicar filtros (definições, comentários) usando a linha onde o match começa.
lines = content.split('\n')

for m in pattern.finditer(content):
    hook_name = m.group(1)
    # Linha do início do match (1-indexed)
    line_idx = content[:m.start()].count('\n')
    line = lines[line_idx] if line_idx < len(lines) else ''
    stripped = line.strip()

    # Pular linhas que são definição (não chamada)
    if re.match(r'^(export\s+)?(function|const)\s', stripped):
        # Definição: useFieldConfig = (pipelineId?: string) => {...}
        # Mas pode ser const x = useFieldConfig() — chamada também!
        # Heurística: se a linha tem `= ... hook()`, é chamada
        if not re.search(r'=\s*[^=].*\b(' + '|'.join(HOOKS) + r')\(', line):
            continue
    # Pular comentários
    if stripped.startswith('//') or stripped.startswith('*'):
        continue

    print(f"{line_idx+1}|{hook_name}|{stripped[:120]}")
PY
)

if [ -z "$VIOLATIONS" ]; then
  exit 0
fi

echo "" >&2
echo "🚫 BLOQUEADO: hook de configuração chamado SEM pipelineId" >&2
echo "   Arquivo: $FILE_PATH" >&2
echo "" >&2
echo "$VIOLATIONS" | while IFS='|' read -r linenum hook_name preview; do
  echo "   linha $linenum:  $hook_name()  →  $preview" >&2
done
echo "" >&2
echo "Por quê: configs (campos por etapa, visibilidade de seção, regras) NÃO são" >&2
echo "isoladas só por filtro de dados. Sem pipelineId, configs de WEDDING" >&2
echo "aparecem em telas de TRIPS (e vice-versa)." >&2
echo "" >&2
echo "Como corrigir:" >&2
echo "   const { pipelineId } = useCurrentProductMeta()  // produto da org ativa" >&2
echo "   // ou para um produto específico (ex: card.produto):" >&2
echo "   const pipelineId = useProductBySlug(card.produto)?.pipeline_id" >&2
echo "" >&2
echo "   const fieldConfig = useFieldConfig(pipelineId)" >&2
echo "" >&2
echo "Exceção legítima (não bloqueada):" >&2
echo "  • src/pages/admin/studio/* + src/components/admin/studio/* (Pipeline Studio)" >&2
echo "" >&2
echo "Veja: CLAUDE.md §TOP 5 #3 + memory/feedback_metadata_isolation.md" >&2
echo "" >&2
exit 2
