#!/bin/bash
# ============================================================================
# UserPromptSubmit hook: injeta topic file relevante baseado em keywords
#
# Por que existe: 63 topic files em ~/.claude/projects/-Users-vitorgambetti-
# Documents-WelcomeCRM/memory/ NÃO são carregados automaticamente. Agente só
# lê se souber que existem. Esse hook quebra o opt-in: detecta keywords no
# prompt do user e injeta o conteúdo do topic file relevante diretamente
# como contexto adicional do turno.
#
# Limite: até 2 topic files por prompt para não inflar contexto.
#
# Stdout (visível ao agente): cabeçalho + conteúdo do topic file
# Stderr: silencioso (logs internos só se debug)
# Exit 0 sempre — esse hook nunca bloqueia, só enriquece contexto.
# ============================================================================

set -euo pipefail

INPUT=$(cat)

PROMPT=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  print(d.get('prompt', ''))
except Exception:
  pass
")

if [ -z "$PROMPT" ]; then
  exit 0
fi

MEMORY_DIR="$HOME/.claude/projects/-Users-vitorgambetti-Documents-WelcomeCRM/memory"

# Tabela keyword regex → topic file (ordem = prioridade)
# Quando matcher casa, injeta o arquivo. Limite 2 matches por prompt.
HOOK_PROMPT="$PROMPT" HOOK_MEMORY_DIR="$MEMORY_DIR" python3 <<'PY'
import os, re, sys, pathlib

prompt = os.environ.get('HOOK_PROMPT', '').lower()
memory_dir = os.environ.get('HOOK_MEMORY_DIR', '')
if not prompt or not memory_dir:
    sys.exit(0)

# Lista ordenada por prioridade (5 primeiras = TOP 5 violações empíricas)
RULES = [
    # (regex, topic file basename, descrição curta)
    (r'\b(workspace|org_id|tenant|isolation|isolamento|cross[\s-]?org|listar.*time|listar.*department|listar.*tag)\b',
     'feedback_workspace_isolation_always.md',
     'isolamento de workspace (org_id obrigatório em listagens)'),

    (r'\b(consultor(es)?|profile|usuário|users|owner|member|org_members|membros)\b',
     'feedback_multi_tenant_org_members.md',
     'multi-tenant: profiles.org_id é armadilha; use org_members'),

    (r'\b(produto|trips|wedding|pipeline|metadata|stage_field|section_field|field_config|stage_section|qualitygate|isolamento.*produto)\b',
     'feedback_metadata_isolation.md',
     'isolamento de metadados (pipelineId em useFieldConfig etc)'),

    (r'\b(migration|migrations|aplicar.*sql|criar.*sql|staging.*primeiro|promote|promo[vt]er.*produc|deploy.*sql|migra[çc][ãa]o)\b',
     'feedback_migration_cleanup.md',
     'protocolo de migrations (staging primeiro, sem rascunho órfão)'),

    (r'\b(create or replace function|recriar.*fun[çc][ãa]o|alterar.*fun[çc][ãa]o|trigger.*fun[çc][ãa]o|rebase.*fun[çc][ãa]o)\b',
     'feedback_function_rebase_cuidado.md',
     'CREATE OR REPLACE FUNCTION: grep migrations anteriores antes'),

    # P1 — areas que aparecem com frequência
    (r'\b(n8n|workflow.*n8n|julia.*n8n|webhook.*n8n|ativador.*campos)\b',
     'n8n-workflows.md',
     'n8n: IDs, deploy rules, Julia gotchas'),

    (r'\b(active.?campaign|integration|integra[çc][ãa]o.*ac|outbound|inbound|contato.*sync)\b',
     'integration-gotchas.md',
     'integrações (AC centavos/reais, triggers, mapeamento)'),

    (r'\b(briefing.*ia|extra[çc][ãa]o.*ia|transcri[çc][ãa]o|whisper|chatia|brief.*ia|assistente.*card)\b',
     'ai-extraction.md',
     'extração IA (briefing, transcrição, campos)'),

    (r'\b(monde|sync.*contato|dedup|importa[çc][ãa]o.*monde)\b',
     'monde-people-sync.md',
     'Monde V2: sync de contatos, dedup, gotchas'),

    (r'\b(julia|luna|estela|am[ée]lia|agente.*ia|ai.?agent|ai_agent|router)\b',
     'luna-paridade-julia-status.md',
     'agentes IA: pipeline, paridade, ai_agent_router'),

    (r'\b(ai.?agent.*config|config.*agente|business_config|qualification.*scoring|few.?shot)\b',
     'ai-agent-config-coverage.md',
     'cobertura de configs editáveis de agentes IA'),

    (r'\b(edge[\s-]?function|verify_jwt|webhook.*receiver|active-campaign-webhook|ghost.*function|ghosting)\b',
     'feedback_edge_function_ghosting.md',
     'edge functions: 404 ghosting, recovery, --no-verify-jwt'),

    (r'\b(csv|encoding|latin.?1|importar.*excel|importa[çc][ãa]o.*planilha)\b',
     'feedback_csv_encoding.md',
     'CSV: Latin-1, não UTF-8'),

    (r'\b(automation_flow|automa[çc][ãa]o.*build|cadence_template|cadence_step|automa[çc][ãa]o.*edit)\b',
     'feedback_automation_edit_routing.md',
     'rotas de edição de automações (event_trigger vs cadence_template)'),

    (r'\b(travel.*planner|propostas.*viagem|trip_items|portal.*cliente|/v/:token|viagens)\b',
     'travel-planner-redesign.md',
     'Travel Planner: arquitetura, marcos, máquina de estados'),

    (r'\b(playbook|playbook.?conversacional|persona.*v2|run_persona|tabplaybook)\b',
     'project_playbook_v2.md',
     'Playbook Conversacional v2 (feature flag, marcos)'),

    (r'\b(estela|sdr.*wedding|knowledge.*base.*wedding)\b',
     'estela-sdr-weddings-implementation.md',
     'Estela SDR Weddings (status, próximos passos)'),

    (r'\b(playwright|e2e|smoke.?test|preview.*vercel|rollback)\b',
     'safety-net-e2e.md',
     'rede de segurança E2E (Playwright, CI, rollback)'),

    (r'\b(perdido|ganho|status.*comercial|motivo_perda|fase.*resolu[çc][ãa]o)\b',
     'feedback_perdido_ganho_sao_status.md',
     'perdido/ganho são status, NUNCA etapas ativas'),

    (r'\b(etapa.*venda|funil.*venda|follow[\s-]?up|qualifica[çc][ãa]o|stage.*ativ)\b',
     'feedback_etapa_vs_acao_vendas.md',
     'etapa vs ação de vendas: marco verificável vs estado contínuo'),

    (r'\b(prompt.*editor|raw.*prompt|edi[çc][ãa]o.*avan[çc]ada|text[ãa]o.*prompt)\b',
     'feedback_no_raw_prompts_in_ui.md',
     'UI nunca expõe textão de prompt — UX estruturada'),

    (r'\b(gestor|perspectiva.*gestor|vis[ãa]o.*time|owner.*filtro)\b',
     'feedback_gestor_perspective_default.md',
     'design de feature: gestor primeiro, owner é filtro'),
]

matched = []
seen_files = set()
for regex, topic_file, label in RULES:
    if re.search(regex, prompt, re.IGNORECASE):
        if topic_file in seen_files:
            continue
        seen_files.add(topic_file)
        matched.append((topic_file, label))
        if len(matched) >= 2:
            break

if not matched:
    sys.exit(0)

# Imprimir cabeçalho + conteúdo de cada topic file
print('')
print('═══════════════════════════════════════════════════════════════════')
print('📌 REGRAS RELEVANTES DETECTADAS — leia ANTES de qualquer ação')
print('═══════════════════════════════════════════════════════════════════')
print('Hook automático detectou keywords no seu prompt que mapeiam para')
print('topic files de regras frequentemente violadas. Conteúdo abaixo.')
print('')

for topic_file, label in matched:
    full_path = os.path.join(memory_dir, topic_file)
    print('─' * 67)
    print(f'📄 {topic_file}')
    print(f'   ({label})')
    print('─' * 67)
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        # Limita a 100 linhas por arquivo (evita inflar contexto)
        lines = content.split('\n')
        if len(lines) > 100:
            content = '\n'.join(lines[:100]) + f'\n\n[... arquivo continua, {len(lines) - 100} linhas adicionais em {full_path} ...]'
        print(content)
        print('')
    except FileNotFoundError:
        print(f'(arquivo não encontrado em {full_path} — possivelmente foi arquivado)')
        print('')

print('═══════════════════════════════════════════════════════════════════')
print('Fim das regras injetadas. Continue com a task.')
print('═══════════════════════════════════════════════════════════════════')
print('')
PY

exit 0
