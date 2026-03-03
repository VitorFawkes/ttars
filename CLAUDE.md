# WelcomeCRM - Instruções

**Supabase Produção:** `szyrzxvlptqqheizyrxu`
**Supabase Staging:** `ivmebyvjarcvrkrbemam`
**Stack:** React + Vite + TailwindCSS + Supabase (PostgreSQL + Edge Functions) + TypeScript Strict

## Regras Invioláveis
- IMPORTANT: NUNCA hardcode secrets. Use `import.meta.env.VITE_*` ou variáveis de ambiente
- IMPORTANT: NUNCA modifique view/trigger/function SQL sem ler docs/SQL_SOP.md primeiro
- IMPORTANT: Antes de criar qualquer hook, componente ou página, verifique no Mapa do Projeto abaixo se já existe algo similar
- IMPORTANT: Ao criar hook/página/componente novo, ATUALIZAR o MAPA DO PROJETO abaixo antes de finalizar
- IMPORTANT: NUNCA aplicar migrations diretamente em PRODUÇÃO. Sempre STAGING primeiro. Ver "Protocolo de Migrations" abaixo.
- IMPORTANT: Ao criar view/coluna nova usada pelo frontend, adicionar a query ao smoke test em `.claude/hooks/schema-smoke-test.sh`
- Commits em português. Co-author: `Co-Authored-By: Claude <noreply@anthropic.com>`

## Ambientes (OBRIGATÓRIO ENTENDER)

| Ambiente | Banco | Quando |
|----------|-------|--------|
| `npm run dev` (local) | **PRODUÇÃO** (szyrzxvlptqqheizyrxu) | Desenvolvimento (staging sem dados de teste ainda) |
| Vercel Preview (branches) | **STAGING** (ivmebyvjarcvrkrbemam) | PRs e testes |
| Vercel Production (main) | **PRODUÇÃO** (szyrzxvlptqqheizyrxu) | Usuários finais |

**Regra:** Migrations SEMPRE vão para staging primeiro via script (`apply-to-staging.sh`). O dev local lê dados de produção mas NUNCA aplica SQL diretamente nele — use os scripts. Quando staging tiver dados de teste, restaurar `.env.development` a partir de `.env.development.staging`.

## Protocolo de Migrations (OBRIGATÓRIO)

### Fluxo: Staging → Teste → Produção

**Passo 1 — Aplicar no STAGING:**
```bash
bash .claude/hooks/apply-to-staging.sh supabase/migrations/SEU_ARQUIVO.sql
```

**Passo 2 — Testar:** O frontend local (`npm run dev`) já aponta para staging. Verificar que funciona.

**Passo 3 — Promover para PRODUÇÃO** (quando o usuário pedir):
```bash
bash .claude/hooks/promote-to-prod.sh supabase/migrations/SEU_ARQUIVO.sql
```
Esse script aplica no banco de produção E roda o smoke test automaticamente.

**Passo 4 — Marcar:**
```bash
touch .claude/.migration_applied
```

### Quando o usuário diz...

| Frase do usuário | O que o agente faz |
|-------------------|-------------------|
| "Crie uma migration" / feature normal | Escrever SQL → aplicar no STAGING → testar → código frontend |
| "Aplique no staging" | `bash .claude/hooks/apply-to-staging.sh <arquivo>` |
| "Promova para produção" / "Suba para produção" | `bash .claude/hooks/promote-to-prod.sh <arquivo>` para CADA migration pendente |
| "Está tudo ok, pode subir" | Promover todas migrations pendentes + `touch .claude/.migration_applied` |

### Regras de segurança
- NUNCA usar `SUPABASE_ACCESS_TOKEN` (produção) direto. Sempre via script `promote-to-prod.sh`
- NUNCA pular o staging. Se urgente, aplicar no staging primeiro mesmo assim.
- Se a migration falhar no staging, corrigir ANTES de promover.
- O Stop hook BLOQUEIA se detectar `.sql` novo/modificado sem registro no `.claude/.migration_log`
- `promote-to-prod.sh` registra automaticamente cada arquivo no log
- Após terminar todas migrations, rodar `touch .claude/.migration_applied` (backward compat)
- **NUNCA deixe migrations intermediárias/rascunho no disco** — se uma migration foi supersedida por outra, DELETE o arquivo antigo
- Após aplicar em produção, **commitar o arquivo .sql** no git para evitar acúmulo de untracked files

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
| Analytics | analytics/AnalyticsPage.tsx | Dashboard analítico — layout sidebar + 9 views (Zustand + React Query + RPCs) |
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
| useCardTags | 5+ | Lista global de tags (cached 5min) + CRUD para admins. useCardTagAssignments(cardId) para assign/unassign |
| useAnalyticsFilters | 8+ | Zustand store de filtros globais do Analytics (datas, granularidade, produto, tagIds) |
| useOverviewData | 1 | KPIs, funil e timeseries do Overview Analytics |
| useTeamPerformance | 1 | Performance por consultor (SDR/Planner/Pós) via RPC |
| useFunnelConversion | 1 | Funil end-to-end + motivos de perda via RPC |
| useSLAData | 1 | Violações e compliance de SLA via RPC |
| useWhatsAppAnalytics | 2 | Métricas WhatsApp overview: volume, aging, response time, agent perf via RPC |
| useWhatsAppConversations | 1 | Lista de conversas WhatsApp paginada/ordenável/filtrável por status via RPC |
| useWhatsAppSpeed | 1 | SLA compliance, FRT trend, FRT por hora, IA vs Humano via RPC |
| useOperationsData | 1 | Viagens realizadas, sub-cards, qualidade por planner via RPC |
| useFinancialData | 1 | Receita vs margem, top destinos, receita por produto via RPC |
| useRetentionData | 1 | Cohort de recompra + KPIs de recorrência via RPC |
| useBriefingIA | 1 | Processa áudio de briefing do consultor via n8n webhook (Whisper + GPT-5.1) |
| useChatIA | 1 | Chat com IA sobre conversas WhatsApp do cliente via n8n webhook (GPT-4.1-mini) |
| useFunnelByOwner | 1 | Funil operacional com breakdown por responsável (stacked bars) via RPC |
| usePipelineCurrent | 1 | Snapshot do pipeline aberto: KPIs, stages, aging, owners, top deals via RPC |
| useReportBuilderStore | 1 | Zustand store do Report Builder (IQR, viz, filtros, ~30 ações) |
| useReportEngine | 2 | IQR → RPC report_query_engine → dados agregados |
| useReportDrillDown | 1 | Drill-down em ponto do gráfico → registros individuais via RPC |
| useFieldRegistry | 2 | Campos/dimensões/medidas filtrados por permissão, por source |
| useSavedReports | 4+ | CRUD relatórios customizados (custom_reports) |
| useSavedDashboards | 4+ | CRUD dashboards + widgets (custom_dashboards, dashboard_widgets) |
| useCalendarFilters | 1 | Zustand store de filtros do calendário (datas, consultores, view mode) |
| useCalendarMeetings | 1 | Fetch de reuniões filtradas por período e consultor via React Query |
| useMeetingDrag | 1 | Drag-and-drop de reuniões entre horários/dias no calendário |
| useMeetingMutation | 2 | CRUD de reuniões (criar, editar, deletar, reagendar) + envio de convite .ics por email via n8n |
| useTodayMeetingCount | 2 | Contagem de reuniões do dia para badge no Sidebar e Dashboard widget |

### Componentes Principais (src/components/)
| Área | Componentes-chave |
|------|-------------------|
| Layout | Header, Sidebar, Layout, ProductSwitcher, NotificationCenter |
| Pipeline | KanbanBoard, PipelineListView, CreateCardModal, FilterDrawer, DocumentBadge |
| Card | CardHeader, DynamicFieldRenderer, ActivityFeed, CardFiles, StageRequirements, FinanceiroWidget, CardTeamSection, DocumentCollectionWidget, BriefingIAModal, AudioRecorder, WeddingInformation, TagBadge, TagSelector |
| Propostas | ProposalBuilder, SectionEditor, AddItemMenu, VersionHistory |
| Admin | StudioUnified, IntegrationBuilder, KanbanCardSettings, JuliaIAConfig |
| Health | IntegrationHealthTab, PulseGrid, ActiveAlertsList, HealthRulesConfig |
| Pessoas | PeopleGrid, PersonDetailDrawer, ContactForm, ContactImportModal, DuplicateWarningPanel, DataQualityBanner, DataQualityDrawer |
| Leads | LeadsTable, LeadsFilters, LeadsBulkActions |
| Trips | TripsTaxBadge, group/* (GroupDashboard, GroupTravelersList, CreateGroupModal, LinkToGroupModal) |
| Monde | MondeWidget |
| UI Base | src/components/ui/ — 29 componentes Radix UI (Button, Dialog, Select, etc.) + QueryErrorState |
| Resiliência | NetworkStatusBanner (banner offline/online no Layout) |
| Analytics | AnalyticsSidebar, GlobalControls, KpiCard, ChartCard, views/OverviewView, views/PipelineCurrentView, views/TeamView, views/FunnelView, views/SLAView, views/WhatsAppView (4 sub-tabs: Overview, Conversas, Velocidade, Equipe&IA), views/OperationsView, views/FinancialView, views/RetentionView, views/PlaceholderView |
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
| card_tags | Definições de tags (gerenciadas por admins): name, color, produto, is_active | → profiles (created_by) |
| card_tag_assignments | M:N cards↔tags: assign/unassign por qualquer user autenticado | → cards, card_tags |
| invitations | Convites de novos membros com token 7 dias: email, role, team_id, **produtos** (text[] | NULL = todos) | → profiles (created_by), teams |

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
| create-n8n-chat-ia.js | Cria workflow n8n "Chat IA Conversas" (pergunta consultor → WhatsApp history → GPT-4.1-mini → resposta) |
| create-n8n-meeting-invite.js | Cria workflow n8n "Meeting Invite" (email .ics via SMTP Office365) |
| create-n8n-transcript-workflow.js | Cria workflow n8n "Transcrição Reunião" (texto reunião → GPT-5.1 → campos CRM + briefing) |

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

### Workflow n8n — Transcrição Reunião (Extração de Campos)
- **Workflow ID:** `mhQgSQQ2MMk8KxPE`
- **Webhook:** `https://n8n-n8n.ymnmx7.easypanel.host/webhook/transcript-process`
- **15 nós** — Pipeline: Webhook → Extrai Params → Busca Card → Busca Config → **Busca Visibilidade (stage_field_config)** → Monta Contexto (filtra campos ocultos) → AI Extrator (GPT-5.1 Agent) → Valida Output → If Tem Atualização → Busca produto_data → Merge Dados → Atualiza Card (RPC) → Atualiza Metadata Tarefa → Log Activity → Sucesso/Sem Atualização
- **Reusa:** `get_ai_extraction_config()` e `update_card_from_ai_extraction()` (mesmos do Briefing IA)
- **Frontend:** SmartTaskModal (ao completar reunião com transcrição + toggle "Processar com IA") + MeetingTimeline (reprocessar) + MeetingModal
- **Input:** `{ card_id, meeting_id, transcription }` (texto, não áudio)
- **Output:** `{ status: 'success'|'no_update', campos_extraidos: string[], campos_atualizados: {} }`
- **Metadata:** Atualiza `tarefas.transcricao_metadata` com `{ processed_at, campos_extraidos[] }`
- **Deploy:** `source .env && node scripts/create-n8n-transcript-workflow.js`

### Workflow n8n — Meeting Invite (Email .ics)
- **Workflow ID:** `mBBtXxQnQqra5eoY`
- **Webhook:** `https://n8n-n8n.ymnmx7.easypanel.host/webhook/meeting-invite`
- **10 nós** — Pipeline: Webhook → Extrai Params → Busca Reunião (tarefas+card+contato) → Busca Responsável (profiles) → Code (resolve emails + .ics RFC 5545 + meeting_link + HTML) → If Tem Emails → Send Email (SMTP Office365) → Log Activity (insere `email_sent` na tabela activities) → Resposta Sucesso / Resposta No Email
- **Meeting Link:** Se `metadata.meeting_link` existir → LOCATION/URL no .ics + botão "Entrar na Reunião" no HTML
- **Activity Log:** Após envio, registra `email_sent` com `source: meeting_invite` no feed do card
- **SMTP:** `contato@welcometrips.com.br` via `smtp.office365.com:587` (STARTTLS)
- **Credential SMTP:** ID `ZIqaH9kmOtsFI4p7` (WelcomeCRM SMTP)
- **Frontend:** `useMeetingMutation.ts` → `sendMeetingInvite()` fire-and-forget em `createMeeting.onSuccess` e `rescheduleMeeting.onSuccess`
- **Input:** `{ meeting_id, card_id, action: 'created'|'rescheduled', user_id }`
- **Output:** `{ status: 'sent'|'no_email'|'error', recipients?: string[] }`

### Workflow n8n — Chat IA Conversas
- **Workflow ID:** `rvchg8mfe7vI2urS`
- **Webhook:** `https://n8n-n8n.ymnmx7.easypanel.host/webhook/chat-ia`
- **8 nós** — Pipeline: Webhook → Extrai Params → Busca Card → Busca Contato → Busca Mensagens WhatsApp → Monta Contexto (Code) → AI Chat (GPT-5.1 Agent, temp=0) → Formata Resposta
- **Frontend:** Aba "Chat com IA" em ConversationHistory → AIChat → useChatIA hook
- **Input:** `{ card_id, contact_id, question, chat_history[] }`
- **Output:** `{ answer, sources_count, card_id }`
- **Multi-turn:** chat_history[] mantido no frontend (useState) para conversas consecutivas

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
