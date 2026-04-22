#!/bin/bash
INPUT=$(cat)
ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active')

# Evitar loop infinito
if [ "$ACTIVE" = "true" ]; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd')
cd "$CWD" 2>/dev/null || exit 0

# Pegar APENAS arquivos TS/TSX modificados (não o projeto inteiro)
# Filtrar arquivos deletados (que não existem mais no disco)
CHANGED_FILES=$(git diff --name-only 2>/dev/null | grep -E '\.(ts|tsx)$' | while read -r f; do [ -f "$f" ] && echo "$f"; done)
if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

# Lint apenas nos arquivos alterados
LINT_OUTPUT=$(echo "$CHANGED_FILES" | xargs npx eslint --no-warn-ignored 2>&1)
if [ $? -ne 0 ]; then
  echo "ESLint tem erros nos arquivos modificados. Corrija antes de finalizar:" >&2
  echo "$LINT_OUTPUT" | grep -E "error|warning" | tail -15 >&2
  exit 2
fi

# Build completo (tsc + vite build — pega erros de tipo, imports quebrados, case sensitivity, bundling)
BUILD_OUTPUT=$(npm run build 2>&1)
if [ $? -ne 0 ]; then
  echo "Build falhou. Corrija antes de finalizar:" >&2
  echo "$BUILD_OUTPUT" | tail -20 >&2
  exit 2
fi

# ── Isolamento de metadados: hooks de config DEVEM receber pipelineId ──
# BLOQUEIA se arquivos modificados chamam hooks de config sem pipelineId
# ou fazem queries diretas a tabelas de config fora dos hooks centrais
PIPELINE_HOOKS="useFieldConfig|useStageSectionConfig|useStageFieldConfirmations|useQualityGate"
# Tabelas de config que só devem ser acessadas via hooks (não .from() direto em componentes)
CONFIG_TABLES="stage_field_config|stage_section_config|section_field_config|stage_field_confirmations"
# Excluir: definições dos hooks, Pipeline Studio (admin precisa de visão global), testes, hooks analytics
EXCLUDE_PATTERN="src/hooks/(useFieldConfig|useStageSectionConfig|useSectionFieldConfig|useStageFieldConfirmations|useQualityGate)\.ts|src/components/admin/studio/|__tests__"
ISOLATION_VIOLATIONS=""
for f in $CHANGED_FILES; do
  echo "$f" | grep -qE "$EXCLUDE_PATTERN" && continue
  # 1. Hooks de config chamados sem pipelineId: useFieldConfig() ou useQualityGate()
  if grep -qE "($PIPELINE_HOOKS)\(\)" "$f" 2>/dev/null; then
    MATCHES=$(grep -nE "($PIPELINE_HOOKS)\(\)" "$f" 2>/dev/null | head -3)
    ISOLATION_VIOLATIONS=$(printf "%s\n  %s (hook sem pipelineId): %s" "$ISOLATION_VIOLATIONS" "$f" "$MATCHES")
  fi
  # 2. Queries diretas a tabelas de config fora dos hooks centrais
  if grep -qE "\.from\(['\"]($CONFIG_TABLES)['\"]" "$f" 2>/dev/null; then
    MATCHES=$(grep -nE "\.from\(['\"]($CONFIG_TABLES)['\"]" "$f" 2>/dev/null | head -3)
    ISOLATION_VIOLATIONS=$(printf "%s\n  %s (query direta a tabela de config — use o hook centralizado): %s" "$ISOLATION_VIOLATIONS" "$f" "$MATCHES")
  fi
done
if [ -n "$ISOLATION_VIOLATIONS" ]; then
  echo "" >&2
  echo "BLOQUEADO: Violação de isolamento de metadados (vazamento cross-pipeline):" >&2
  echo "$ISOLATION_VIOLATIONS" >&2
  echo "" >&2
  echo "Correção:" >&2
  echo "  - Hooks: passe pipelineId → useFieldConfig(pipelineId), useQualityGate(pipelineId), etc." >&2
  echo "  - Queries diretas: use os hooks centrais (useFieldConfig, useStageSectionConfig, etc.)" >&2
  echo "  - Obter pipelineId via useCurrentProductMeta().pipelineId ou useProductPipelineId(card.produto)" >&2
  echo "  - Ver CLAUDE.md → 'Isolamento de Metadados'" >&2
  echo "" >&2
  exit 2
fi

# ── Isolamento por workspace: listagens de tabelas por-org SEM filtro org_id ──
# Diretiva Vitor 2026-04-22: TODO lugar mostra só o do workspace. Detecta
# `.from('<tabela>')` sem `.eq('org_id', ...)` em até 8 linhas de distância para
# tabelas críticas que causam vazamento cross-workspace. Ignora lookups por id único
# (`.eq('id', ...).single()`), chains de `.update(...).eq('id', ...)` (mutations
# específicas não precisam de org filter), e pages de admin de plataforma.
WS_TABLES="teams|departments|motivos_perda|card_tags|pipelines|cadence_templates|ai_agents|automation_flows"
WS_EXCLUDE="src/pages/platform/|__tests__|\.migration"
WS_VIOLATIONS=""
for f in $CHANGED_FILES; do
  echo "$f" | grep -qE "$WS_EXCLUDE" && continue
  # awk: se .from('tabela_critica') aparece, procura em até 8 linhas:
  #   - um .eq('org_id', ...) → OK
  #   - um .eq('id', ...) (lookup por id) → OK
  #   - .update/.delete/.upsert + .eq → OK (mutation específica)
  # Se nenhum desses match → violação
  MATCH=$(awk -v tables="$WS_TABLES" '
    BEGIN { re = "\\.from\\([\"'\''](" tables ")[\"'\'']\\)" }
    $0 ~ re { from_line=NR; hit=1; context=""; next }
    hit {
      context = context $0 "\n"
      if ($0 ~ /\.eq\([\"'\''](org_id|id)[\"'\'']/) { hit=0; next }
      if ($0 ~ /\.(update|delete|upsert|insert)\(/) { hit=0; next }
      if (NR - from_line >= 8) {
        if (hit) print from_line
        hit=0
      }
    }
  ' "$f" 2>/dev/null | head -3)
  if [ -n "$MATCH" ]; then
    for line in $MATCH; do
      SNIPPET=$(sed -n "${line},$((line+2))p" "$f" 2>/dev/null | tr '\n' ' ' | head -c 140)
      WS_VIOLATIONS=$(printf "%s\n  %s:%s — %s" "$WS_VIOLATIONS" "$f" "$line" "$SNIPPET")
    done
  fi
done
if [ -n "$WS_VIOLATIONS" ]; then
  echo "" >&2
  echo "BLOQUEADO: Listagem de tabela por-org sem filtro de workspace:" >&2
  echo "$WS_VIOLATIONS" >&2
  echo "" >&2
  echo "Toda tabela por-org (teams, departments, motivos_perda, card_tags, pipelines,"  >&2
  echo "cadence_templates, ai_agents, automation_flows, ...) DEVE filtrar por workspace:" >&2
  echo "" >&2
  echo "  const { org } = useOrg()" >&2
  echo "  supabase.from('teams').select('*').eq('org_id', org?.id)" >&2
  echo "" >&2
  echo "Ver CLAUDE.md → 'Isolamento por workspace'." >&2
  exit 2
fi

# ── Multi-tenant: listar usuários via org_members, não profiles.org_id ──
# Armadilha recorrente: profiles.org_id aponta pra account pai em workspace filho.
# Qualquer `.from('profiles').eq('org_id', ...)` fora de admin de plataforma
# vaza lista vazia em workspace filho. Use org_members JOIN profiles.
# Bug canônico: filtro Consultores em /analytics/funil só mostrando "Test User" (2026-04-22).
MT_EXCLUDE_PATTERN="src/pages/platform/|src/pages/admin/|src/hooks/usePlatformAdmin\.ts|src/hooks/useOrganizations\.ts|src/hooks/useOrgMembers\.ts|src/hooks/useOrgSwitch\.ts|src/contexts/OrgContext\.tsx|__tests__"
MT_VIOLATIONS=""
for f in $CHANGED_FILES; do
  echo "$f" | grep -qE "$MT_EXCLUDE_PATTERN" && continue
  # awk: detecta `.from('profiles')` seguido de `.eq('org_id', ...)` em até 6 linhas
  MATCH=$(awk '
    /\.from\(["'\''"]profiles["'\''"]\)/ { from_line=NR; hit_from=1; next }
    hit_from && NR - from_line <= 6 {
      if ($0 ~ /\.eq\(["'\''"]org_id["'\''"]/) {
        print from_line ":" $0
        hit_from=0
      }
    }
    hit_from && NR - from_line > 6 { hit_from=0 }
  ' "$f" 2>/dev/null | head -3)
  if [ -n "$MATCH" ]; then
    MT_VIOLATIONS=$(printf "%s\n  %s:\n%s" "$MT_VIOLATIONS" "$f" "$(echo "$MATCH" | sed 's/^/    /')")
  fi
done
if [ -n "$MT_VIOLATIONS" ]; then
  echo "" >&2
  echo "BLOQUEADO: Multi-tenant — listagem de usuários via profiles.org_id:" >&2
  echo "$MT_VIOLATIONS" >&2
  echo "" >&2
  echo "Em workspace filho, profiles.org_id aponta pra account pai, não pro workspace." >&2
  echo "Use org_members pra listar membros do workspace:" >&2
  echo "" >&2
  echo "  supabase.from('org_members')" >&2
  echo "    .select('user_id, profiles!inner(id, nome, active)')" >&2
  echo "    .eq('org_id', workspaceId)" >&2
  echo "" >&2
  echo "Hook pronto: useFilterProfiles() em src/hooks/analytics/useFilterOptions.ts" >&2
  echo "Ver CLAUDE.md → 'Queries comuns multi-tenant'" >&2
  exit 2
fi

# Verificar se arquivos novos foram criados em diretórios-chave
# Se sim, CODEBASE.md deve ter sido atualizado (via npm run sync:fix)
NEW_UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '^src/(hooks|pages|components)/.*\.(ts|tsx)$')
NEW_STAGED=$(git diff --name-status 2>/dev/null | grep "^A" | grep -E 'src/(hooks|pages|components)/' | awk '{print $2}')
NEW_FILES=$(printf "%s\n%s" "$NEW_UNTRACKED" "$NEW_STAGED" | grep -v '^$')
if [ -n "$NEW_FILES" ]; then
  # Verificar se CODEBASE.md foi atualizado (via npm run sync:fix)
  CODEBASE_UPDATED=$(git diff --name-only 2>/dev/null | grep "CODEBASE.md")
  if [ -z "$CODEBASE_UPDATED" ]; then
    echo "Arquivos novos criados mas CODEBASE.md não foi atualizado:" >&2
    echo "$NEW_FILES" | sed 's/^/  + /' >&2
    echo "" >&2
    echo "Execute: npm run sync:fix" >&2
    exit 2
  fi
fi

# ── Migration guard: bloqueia se .sql novo/modificado sem registro no log ──
# Ignora _archived/ e _baseline/ (migrations consolidadas) e arquivos deletados
SQL_NEW=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '^supabase/migrations/.*\.sql$' | grep -vE '_(archived|baseline)/')
SQL_MOD=$(git diff --name-only 2>/dev/null | grep -E '^supabase/migrations/.*\.sql$' | grep -vE '_(archived|baseline)/')
# Filtrar arquivos deletados (só verificar os que existem no disco)
ALL_SQL=$(printf "%s\n%s" "$SQL_NEW" "$SQL_MOD" | sort -u | grep -v '^$' | while read -r f; do [ -f "$f" ] && echo "$f"; done)

if [ -n "$ALL_SQL" ]; then
  LOG_FILE="$CWD/.claude/.migration_log"
  MARKER="$CWD/.claude/.migration_applied"
  PENDING_SQL=""

  # Checar cada arquivo contra o log por arquivo
  while IFS= read -r sql_file; do
    if [ -f "$LOG_FILE" ] && grep -qF "$sql_file" "$LOG_FILE"; then
      : # Já registrado no log — ok
    else
      PENDING_SQL=$(printf "%s\n%s" "$PENDING_SQL" "$sql_file")
    fi
  done <<< "$ALL_SQL"

  PENDING_SQL=$(echo "$PENDING_SQL" | grep -v '^$')

  if [ -n "$PENDING_SQL" ]; then
    # Fallback: aceitar marker booleano < 30 min (backward compat)
    if [ -f "$MARKER" ] && [ -z "$(find "$MARKER" -mmin +30 2>/dev/null)" ]; then
      : # Marker recente — permitir (backward compat)
    else
      echo "" >&2
      echo "BLOQUEADO: Migrations SQL não registradas em .claude/.migration_log:" >&2
      echo "$PENDING_SQL" | sed 's/^/  /' >&2
      echo "" >&2
      echo "Workflow obrigatório:" >&2
      echo "  1. bash .claude/hooks/apply-to-staging.sh <arquivo.sql>" >&2
      echo "  2. Testar com npm run dev (aponta para staging)" >&2
      echo "  3. bash .claude/hooks/promote-to-prod.sh <arquivo.sql>" >&2
      echo "     (promote-to-prod.sh registra automaticamente no log)" >&2
      echo "" >&2
      echo "Veja CLAUDE.md seção 'Protocolo de Migrations'." >&2
      exit 2
    fi
  fi

  # Smoke test — rodar contra staging se migrations pendentes, produção se promovidas
  SMOKE_SCRIPT="$CWD/.claude/hooks/schema-smoke-test.sh"
  if [ -f "$SMOKE_SCRIPT" ]; then
    if [ -n "$PENDING_SQL" ]; then
      # Migrations pendentes → testar contra STAGING
      export SMOKE_URL="https://ivmebyvjarcvrkrbemam.supabase.co"
      export SMOKE_ANON="${STAGING_SUPABASE_ANON_KEY:-}"
      export SMOKE_KEY="${STAGING_SERVICE_ROLE_KEY:-}"
      SMOKE_TARGET="staging"
    else
      SMOKE_TARGET="produção"
    fi

    if [ -z "${SMOKE_ANON:-}" ] && [ "$SMOKE_TARGET" = "staging" ]; then
      echo "SKIP: credenciais de staging não disponíveis para smoke test" >&2
    else
      SMOKE_OUTPUT=$("$SMOKE_SCRIPT" 2>&1)
      SMOKE_EXIT=$?
      if [ $SMOKE_EXIT -ne 0 ]; then
        echo "" >&2
        echo "BLOQUEADO: Smoke test falhou contra $SMOKE_TARGET:" >&2
        echo "$SMOKE_OUTPUT" >&2
        echo "" >&2
        if [ "$SMOKE_TARGET" = "staging" ]; then
          echo "A migration precisa funcionar no staging antes de promover." >&2
        else
          echo "A migration pode não ter sido promovida corretamente." >&2
        fi
        exit 2
      fi
    fi
  fi
fi

# Guardião de isolamento por workspace — sempre roda (independente de .sql)
AUDIT_RLS="$CWD/.claude/hooks/audit-rls-leaks.sh"
if [ -x "$AUDIT_RLS" ]; then
  AUDIT_OUTPUT=$("$AUDIT_RLS" 2>&1)
  AUDIT_EXIT=$?
  if [ $AUDIT_EXIT -ne 0 ]; then
    echo "$AUDIT_OUTPUT" >&2
    exit 2
  fi
fi

exit 0
