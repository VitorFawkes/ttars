# WelcomeCRM - Instruções

**Supabase Project:** `szyrzxvlptqqheizyrxu`
**Stack:** React + Vite + TailwindCSS + Supabase (PostgreSQL + Edge Functions) + TypeScript Strict

## Regras Invioláveis
- IMPORTANT: NUNCA hardcode secrets. Use `import.meta.env.VITE_*` ou variáveis de ambiente
- IMPORTANT: NUNCA modifique view/trigger/function SQL sem ler docs/SQL_SOP.md primeiro
- IMPORTANT: Antes de criar qualquer hook, componente ou página, verifique no Mapa do Projeto abaixo se já existe algo similar
- IMPORTANT: Ao criar hook/página/componente novo, ATUALIZAR o MAPA DO PROJETO abaixo antes de finalizar
- IMPORTANT: Toda migration em `supabase/migrations/` DEVE ser aplicada ao banco remoto ANTES de escrever código que dependa dela. Workflow: 1) SQL → 2) Aplicar via Management API → 3) Verificar via REST → 4) `touch .claude/.migration_applied` → 5) Frontend. O Stop hook BLOQUEIA se detectar .sql novo sem marker.
- Commits em português. Co-author: `Co-Authored-By: Claude <noreply@anthropic.com>`

## Protocolo de Migrations (OBRIGATÓRIO)
**Workflow:** Escrever SQL → Aplicar → Verificar → Marcar → Frontend

```bash
# 1. Aplicar migration ao banco remoto
source .env && python3 -c "
import json,subprocess,os
sql = open('supabase/migrations/SEU_ARQUIVO.sql').read()
r = subprocess.run(['curl','-sS','-X','POST',
  'https://api.supabase.com/v1/projects/szyrzxvlptqqheizyrxu/database/query',
  '-H','Authorization: Bearer '+os.environ['SUPABASE_ACCESS_TOKEN'],
  '-H','Content-Type: application/json',
  '-d',json.dumps({'query':sql})], capture_output=True, text=True)
print(r.stdout[:500])
"

# 2. Verificar que as mudanças existem no banco (exemplo para view)
source .env && curl -sS "https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/NOME_VIEW?select=COLUNA_NOVA&limit=1" \
  --header "apikey: $VITE_SUPABASE_ANON_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# 3. Marcar como aplicada (libera o Stop hook)
touch .claude/.migration_applied
```

**Se a migration tiver múltiplos statements que falham via Management API**, aplique cada statement separadamente ou use `psql` direto. O importante é verificar que o resultado está no banco.

## Arquitetura (3 Suns)
Toda entidade orbita 3 entidades centrais: `cards`, `contatos`, `profiles`.
Novas tabelas DEVEM ter FK para pelo menos uma dessas. Sem exceção.

---

## MAPA DO PROJETO

### Páginas (src/pages/)
| Página | Arquivo | O que faz |
|--------|---------|-----------|
| Dashboard | Dashboard.tsx | Stats, gráfico funil, atividade recente |
| Pipeline | Pipeline.tsx | Kanban + lista de cards/deals |
| Card Detail | CardDetail.tsx | Detalhes completos de card/viagem |
| Leads | Leads.tsx | Gestão de leads com tabela e filtros |
| Pessoas | People.tsx | Gestão de contatos com inteligência |
| Grupos | GroupsPage.tsx | Gestão de viagens em grupo |
| Propostas | ProposalsPage.tsx | Listagem de propostas |
| Editor Proposta | ProposalBuilderV4.tsx | Editor moderno de propostas |
| Analytics | analytics/AnalyticsPage.tsx | Dashboard analítico — layout sidebar + 8 views (Zustand + React Query + RPCs) |
| Monde Preview | MondePreviewPage.tsx | Preview integração Monde |
| Pipeline Studio | admin/PipelineStudio.tsx | Config de pipeline (stages, phases) |
| Usuários | admin/UserManagement.tsx | Gestão de usuários/roles |
| Categorias | admin/CategoryManagement.tsx | Categorias/tags |
| Motivos Perda | admin/LossReasonManagement.tsx | Config motivos de perda |
| Saúde CRM | admin/CRMHealth.tsx | Monitoramento do sistema + integrações (tabs) |
| Cadência | admin/cadence/* | Motor de automação de vendas v3 |
| Lixeira | admin/Lixeira.tsx | Itens deletados |
| Proposta Pública | public/ProposalView.tsx | Visualização do cliente |
| Calendário | CalendarPage.tsx | Agenda de reuniões — views dia/semana/mês com drag-and-drop |
| Relatórios | reports/ReportsPage.tsx | Report builder + dashboards customizados (sidebar + Outlet) |

### Hooks Mais Usados (src/hooks/)
| Hook | Usado em | O que faz |
|------|----------|-----------|
| useProposalBuilder | 30+ componentes | Estado/lógica do editor de propostas |
| useProposal | 12+ | Dados de uma proposta |
| usePipelineStages | 11+ | Definições de stages |
| useLibrary | 11+ | Itens da biblioteca de conteúdo |
| useFilterOptions | 10+ | Opções de filtros dropdown |
| usePipelinePhases | 9+ | Definições de phases |
| useReceitaPermission | 8+ | Permissão Receita Federal |
| useFieldConfig | 6+ | Configuração dinâmica de campos |
| usePeopleIntelligence | 6+ | Analytics de contatos |
| useLeadsQuery | 5+ | Fetch de dados de leads |
| useSubCards | 5+ | Cards filhos (viagem grupo) |
| useQualityGate | 4+ | Validação de mudança de stage |
| useIntegrationHealth | 3+ | Alertas, regras e pulse de saúde das integrações |
| useStageRequirements | 4+ | Campos obrigatórios por stage |
| usePipelineListCards | 1 | Cards paginados para PipelineListView (exclui terminais) |
| useMyTeamPhase | 2 | Fase do pipeline associada ao time do usuário logado (auto-filter) |
| useTeamFilterMembers | 2 | Resolve teamIds → member IDs via RPC server-side (filtro de time) |
| useDuplicateDetection | 2 | Detecção de duplicados em tempo real (CPF, email, telefone, nome) via RPC |
| useDeleteContact | 1 | Soft-delete e restauração de contatos (padrão useDeleteCard) |
| useNetworkStatus | 1 | Detecta online/offline via eventos nativos do browser |
| useCardTeam | 2 | CRUD membros da equipe do card (assistentes, apoio) + fullTeam unificado. Usado no CardHeader e CardTeamSection |
| useContactQuality | 1 | Auditoria e correção em lote de qualidade de dados cadastrais |
| useDocumentTypes | 2 | Lista tipos de documentos reutilizáveis + criação inline |
| useDocumentCollection | 1 | CRUD de checklist de documentos por card (progress, upload, tarefas) |
| useAnalyticsFilters | 8+ | Zustand store de filtros globais do Analytics (datas, granularidade, produto) |
| useOverviewData | 1 | KPIs, funil e timeseries do Overview Analytics |
| useTeamPerformance | 1 | Performance por consultor (SDR/Planner/Pós) via RPC |
| useFunnelConversion | 1 | Funil end-to-end + motivos de perda via RPC |
| useSLAData | 1 | Violações e compliance de SLA via RPC |
| useWhatsAppAnalytics | 1 | Métricas WhatsApp: volume, aging, response time via RPC |
| useOperationsData | 1 | Viagens realizadas, sub-cards, qualidade por planner via RPC |
| useFinancialData | 1 | Receita vs margem, top destinos, receita por produto via RPC |
| useRetentionData | 1 | Cohort de recompra + KPIs de recorrência via RPC |
| useBriefingIA | 1 | Processa áudio de briefing do consultor via n8n webhook (Whisper + GPT-5.1) |
| useFunnelByOwner | 1 | Funil operacional com breakdown por responsável (stacked bars) via RPC |
| useReportBuilderStore | 1 | Zustand store do Report Builder (IQR, viz, filtros, ~30 ações) |
| useReportEngine | 2 | IQR → RPC report_query_engine → dados agregados |
| useReportDrillDown | 1 | Drill-down em ponto do gráfico → registros individuais via RPC |
| useFieldRegistry | 2 | Campos/dimensões/medidas filtrados por permissão, por source |
| useSavedReports | 4+ | CRUD relatórios customizados (custom_reports) |
| useSavedDashboards | 4+ | CRUD dashboards + widgets (custom_dashboards, dashboard_widgets) |
| useCalendarFilters | 1 | Zustand store de filtros do calendário (datas, consultores, view mode) |
| useCalendarMeetings | 1 | Fetch de reuniões filtradas por período e consultor via React Query |
| useMeetingDrag | 1 | Drag-and-drop de reuniões entre horários/dias no calendário |
| useMeetingMutation | 2 | CRUD de reuniões (criar, editar, deletar, reagendar) |
| useTodayMeetingCount | 2 | Contagem de reuniões do dia para badge no Sidebar e Dashboard widget |

### Componentes Principais (src/components/)
| Área | Componentes-chave |
|------|-------------------|
| Layout | Header, Sidebar, Layout, ProductSwitcher, NotificationCenter |
| Pipeline | KanbanBoard, PipelineListView, CreateCardModal, FilterDrawer, DocumentBadge |
| Card | CardHeader, DynamicFieldRenderer, ActivityFeed, CardFiles, StageRequirements, FinanceiroWidget, CardTeamSection, DocumentCollectionWidget, BriefingIAModal, AudioRecorder |
| Propostas | ProposalBuilder, SectionEditor, AddItemMenu, VersionHistory |
| Admin | StudioUnified, IntegrationBuilder, KanbanCardSettings, JuliaIAConfig |
| Health | IntegrationHealthTab, PulseGrid, ActiveAlertsList, HealthRulesConfig |
| Pessoas | PeopleGrid, PersonDetailDrawer, ContactForm, ContactImportModal, DuplicateWarningPanel, DataQualityBanner, DataQualityDrawer |
| Leads | LeadsTable, LeadsFilters, LeadsBulkActions |
| Trips | TripsTaxBadge, group/* (GroupDashboard, GroupTravelersList, CreateGroupModal, LinkToGroupModal) |
| Monde | MondeWidget |
| UI Base | src/components/ui/ — 29 componentes Radix UI (Button, Dialog, Select, etc.) |
| Resiliência | NetworkStatusBanner (banner offline/online no Layout) |
| Analytics | AnalyticsSidebar, GlobalControls, KpiCard, ChartCard, views/OverviewView, views/TeamView, views/FunnelView, views/SLAView, views/WhatsAppView, views/OperationsView, views/FinancialView, views/RetentionView, views/PlaceholderView |
| Dashboard | StatsCards, FunnelChart, RecentActivity, TodayMeetingsWidget |
| Calendário | CalendarHeader, DayView, WeekView, MonthView, MeetingPopover, MeetingDetailDrawer |
| Relatórios | ReportsSidebar, ReportBuilder, ReportViewer, ReportsList, builder/* (SourceSelector, FieldPicker, ConfigPanel, FilterPanel, VizSelector, ReportPreview, ComparisonToggle, SaveReportDialog), renderers/* (ChartRenderer, BarChart, LineChart, AreaChart, PieChart, Table, Kpi, Funnel, Composed, DrillDownPanel), DashboardEditor, DashboardViewer, DashboardsList, dashboard/* (DashboardGrid, WidgetCard, AddWidgetDialog, DashboardFilters) |

### Tabelas do Banco (principais)
| Tabela | Papel | FK principais |
|--------|-------|---------------|
| **cards** | Central — deals/viagens | → pipeline_stages, contatos, cards (parent) |
| **contatos** | Central — pessoas (cpf_normalizado UNIQUE, rg, passaporte_validade, sexo, tipo_cliente PF/PJ, primeira_venda_data, ultima_venda_data, ultimo_retorno_data, data_cadastro_original, deleted_at, deleted_by) | — |
| **profiles** | Central — usuários | → teams |
| proposals | Propostas comerciais | → cards |
| pipeline_stages | Stages do funil | → pipeline_phases, pipelines |
| pipeline_phases | Fases (SDR/Vendas/Pós) | → pipelines |
| activities | Log de atividades | → cards |
| tarefas | Tasks/tarefas | → cards |
| mensagens | Mensagens | → cards |
| cards_contatos | N:N cards↔contatos | → cards, contatos |
| participacoes | Participantes | → cards |
| stage_field_config | Campos dinâmicos por stage | → pipeline_stages |
| integration_outbound_queue | Fila de sync externo | → cards |
| cadence_instances | Cadências ativas | → cards, cadence_templates |
| monde_sales | Dados Monde | → cards |
| integration_health_rules | Regras de monitoramento | — |
| integration_health_alerts | Alertas gerados | → integration_health_rules, profiles |
| integration_health_pulse | Cache de ultimo evento por canal | — |
| card_team_members | Equipe do card (assistentes, apoio) | → cards, profiles |
| document_types | Tipos de documentos reutilizáveis (passaporte, RG, etc.) | — |
| card_document_requirements | Checklist de documentos por card/viajante | → cards, contatos, document_types |
| custom_reports | Relatórios customizados (IQR config + visualization) | → profiles |
| custom_dashboards | Dashboards de relatórios com filtros globais | → profiles |
| dashboard_widgets | Widgets no grid do dashboard | → custom_dashboards, custom_reports |

### Campos IA no Cards (Agente WhatsApp)
| Coluna | Tipo | Propósito |
|--------|------|-----------|
| `ai_resumo` | TEXT | Resumo de informações do cliente mantido pelo agente IA |
| `ai_contexto` | TEXT | Contexto cronológico da conversa mantido pelo agente IA |
| `ai_responsavel` | TEXT (default 'ia') | Quem responde: 'ia' ou 'humano' |

### Scripts (scripts/)
| Script | O que faz |
|--------|-----------|
| create-n8n-travel-agent.js | Cria workflow n8n do agente Julia (WhatsApp AI) por transformação do modelo |
| create-n8n-briefing-ia.js | Cria workflow n8n "Briefing IA" (áudio consultor → Whisper → GPT-5.1 → campos CRM) |

### Docs Extras (docs/)
| Arquivo | O que faz |
|---------|-----------|
| welcome-trips-faq.md | FAQ da Welcome Trips para ferramenta Info do Agent 3 (Julia) |

### Workflow n8n — Briefing IA (Áudio Consultor)
- **Workflow ID:** `fezRqL6GQFaGyJNG`
- **Webhook:** `https://n8n-n8n.ymnmx7.easypanel.host/webhook/briefing-ia`
- **19 nós** — Pipeline: Webhook → Extrai Params → Prepara Audio (base64→binary) → Whisper API (HTTP Request c/ credential OpenAI) → Extrai Transcrição → Busca Card → Busca Config → **Busca Visibilidade (stage_field_config)** → Monta Contexto (filtra campos ocultos) → AI Briefing (GPT-5.1 Agent) → Valida Output → If Tem Atualização → Merge → Atualiza Card (RPC) → Log Activity → Sucesso/Sem Atualização
- **Reusa:** `get_ai_extraction_config()` e `update_card_from_ai_extraction()` do Atualizador Campos
- **Frontend:** Botão "Briefing IA" em ActionButtons → BriefingIAModal → AudioRecorder (gravar/upload) → useBriefingIA hook
- **Input:** Áudio base64 do consultor (max 10min, WebM/MP3/M4A/WAV)
- **Output:** Briefing text + campos extraídos (destinos, orçamento, época, etc.)

### Workflow n8n — Agente Julia (WhatsApp AI)
- **Workflow ID:** `tvh1SN7VDgy8V3VI`
- **Webhook:** `https://n8n-n8n.ymnmx7.easypanel.host/webhook/welcome-trips-agent`
- **61 nós** — Pipeline: Echo webhook → Process → Lookup/Create contato+card → Check AI Active → Media routing → Redis debounce → Agent 1 (contexto) → Agent 2 (dados) → Agent 3 (Julia responde) → Format → Send via Meta Cloud API (save outbound com external_id no loop)
- **Dedup:** Unique index `(platform_id, external_id)` + ON CONFLICT no `process_whatsapp_raw_event_v2` + human takeover automático via `ecko_agent_id`
- **Persona:** Julia, Consultora de Viagens
- **Objetivo:** Qualificar viagem → Convite taxa R$ 500 → Agendar reunião (via tarefa CRM)
- **Meta Phone Number ID:** `775282882337610` (Trips)

### Views Importantes
- `view_dashboard_funil` — Métricas do funil
- `view_cards_contatos_summary` — Cards com resumo de contatos
- `v_proposal_analytics` — Performance de propostas
- `view_profiles_complete` — Perfis com team/role
- `view_integration_*` — Roteamento e auditoria de integrações

### Relacionamentos-Chave
```
cards → pipeline_stages (etapa_funil_id)
cards → contatos (pessoa_principal_id + cards_contatos M:N)
cards → cards (parent_card_id) — viagens grupo
activities/tarefas/mensagens → cards (card_id)
proposals → cards (card_id)
cadence_instances → cards (card_id)
profiles → teams (team_id)
pipeline_stages → pipeline_phases (phase_id)
pipeline_stages → pipeline_phases (target_phase_id) — handoff entre fases
```

### Arquitetura de Identidade (Fonte da Verdade)
| Conceito | Fonte | Caminho |
|----------|-------|---------|
| **Seção do pipeline** (onde trabalha) | `teams.phase_id` | `profiles.team_id → teams.phase_id → pipeline_phases.slug` |
| **Nível de acesso** (o que pode fazer) | `profiles.is_admin` | `true` = admin/gestor, `false` = membro regular |
| **Handoff de fase** (quem deve receber) | `pipeline_stages.target_phase_id` | UUID FK → pipeline_phases |
| **Role legacy** (backward compat) | `profiles.role` | **CONGELADO** — sync automático via trigger `trg_sync_role_from_team` |

**Regras:**
- `profiles.role` (enum) NÃO deve ser lido para lógica de seção do pipeline — usar `team.phase.slug`
- `isAdmin` deve usar APENAS `profile?.is_admin === true` — nunca checar `role === 'admin'`
- Handoff entre fases usa `target_phase_id` (UUID FK) — nunca `target_role` (string legacy)
- AuthContext já traz joins: `profile.team.phase` e `profile.role_info`

---

## Antes de Modificar Código
1. Leia os arquivos que vai mudar
2. Busque usages do que vai modificar (grep imports e referências)
3. Se criar hook/page/componente novo → atualize o MAPA DO PROJETO acima

## Padrões de Código
- Hooks React: prefixo `use`, em `src/hooks/`
- Páginas: em `src/pages/`, com rota em App.tsx
- Componentes: PascalCase, em `src/components/`

## Design & UI (OBRIGATÓRIO)
**Princípio:** Light Mode First. Se o texto não é legível em fundo branco, está errado.

**Cards/Containers:**
- USAR: `bg-white border border-slate-200 shadow-sm rounded-xl`
- NUNCA: `bg-white/10 backdrop-blur` em fundo branco (invisível)
- NUNCA: `text-white` sem container escuro explícito

**Cores (SEMPRE tokens semânticos):**
- Surface: `bg-white` | Background: `bg-slate-50`
- Text: `text-slate-900` (principal) / `text-slate-500` (secundário)
- Border: `border-slate-200` | Brand: `text-indigo-600` / `bg-indigo-600`
- NUNCA cores hex hardcoded — sempre classes Tailwind

**Glassmorphism — APENAS em:**
- Overlays/modais: `bg-black/20 backdrop-blur-sm`
- Headers sticky: `bg-white/80 backdrop-blur-md border-b border-slate-200`
- Seções explicitamente escuras (sidebar)

**Tipografia:** `tracking-tight` headings | `text-sm` padrão | `font-medium` interativos

## Comandos Úteis
```bash
source .env  # carregar credenciais

# Query rápida ao banco
curl -s "https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/{tabela}?select=*&limit=5" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Deploy Edge Function
npx supabase functions deploy {NOME} --project-ref szyrzxvlptqqheizyrxu

# Regenerar Types
npx supabase gen types typescript --project-id szyrzxvlptqqheizyrxu > src/database.types.ts

# Qualidade
npm run build          # build completo (inclui typecheck)
npm run sync:fix       # atualizar CODEBASE.md automaticamente
```

## n8n Workflow (Agente Julia)
```bash
# Recriar workflow do agente Julia (WhatsApp AI)
source .env && node scripts/create-n8n-travel-agent.js
```

## Referências Detalhadas
- .agent/CODEBASE.md → Inventário completo e detalhado
- docs/SQL_SOP.md → Procedimentos SQL (OBRIGATÓRIO antes de views/triggers)
- docs/SYSTEM_CONTEXT.md → Decisões arquiteturais
- docs/DESIGN_SYSTEM.md → Regras de UI
