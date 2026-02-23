# WelcomeCRM - Instruções

**Supabase Project:** `szyrzxvlptqqheizyrxu`
**Stack:** React + Vite + TailwindCSS + Supabase (PostgreSQL + Edge Functions) + TypeScript Strict

## Regras Invioláveis
- IMPORTANT: NUNCA hardcode secrets. Use `import.meta.env.VITE_*` ou variáveis de ambiente
- IMPORTANT: NUNCA modifique view/trigger/function SQL sem ler docs/SQL_SOP.md primeiro
- IMPORTANT: Antes de criar qualquer hook, componente ou página, verifique no Mapa do Projeto abaixo se já existe algo similar
- IMPORTANT: Ao criar hook/página/componente novo, ATUALIZAR o MAPA DO PROJETO abaixo antes de finalizar
- Commits em português. Co-author: `Co-Authored-By: Claude <noreply@anthropic.com>`

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
| Analytics | Analytics.tsx | Dashboard analítico |
| Monde Preview | MondePreviewPage.tsx | Preview integração Monde |
| Pipeline Studio | admin/PipelineStudio.tsx | Config de pipeline (stages, phases) |
| Usuários | admin/UserManagement.tsx | Gestão de usuários/roles |
| Categorias | admin/CategoryManagement.tsx | Categorias/tags |
| Motivos Perda | admin/LossReasonManagement.tsx | Config motivos de perda |
| Saúde CRM | admin/CRMHealth.tsx | Monitoramento do sistema + integrações (tabs) |
| Cadência | admin/cadence/* | Motor de automação de vendas v3 |
| Lixeira | admin/Lixeira.tsx | Itens deletados |
| Proposta Pública | public/ProposalView.tsx | Visualização do cliente |

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

### Componentes Principais (src/components/)
| Área | Componentes-chave |
|------|-------------------|
| Layout | Header, Sidebar, Layout, ProductSwitcher, NotificationCenter |
| Pipeline | KanbanBoard, PipelineListView, CreateCardModal, FilterDrawer |
| Card | CardHeader, DynamicFieldRenderer, ActivityFeed, CardFiles, StageRequirements, FinanceiroWidget, CardTeamSection |
| Propostas | ProposalBuilder, SectionEditor, AddItemMenu, VersionHistory |
| Admin | StudioUnified, IntegrationBuilder, KanbanCardSettings, JuliaIAConfig |
| Health | IntegrationHealthTab, PulseGrid, ActiveAlertsList, HealthRulesConfig |
| Pessoas | PeopleGrid, PersonDetailDrawer, ContactForm, ContactImportModal, DuplicateWarningPanel, DataQualityBanner, DataQualityDrawer |
| Leads | LeadsTable, LeadsFilters, LeadsBulkActions |
| Trips | TripsTaxBadge, group/* (GroupDashboard, GroupTravelersList, CreateGroupModal, LinkToGroupModal) |
| Monde | MondeWidget |
| UI Base | src/components/ui/ — 29 componentes Radix UI (Button, Dialog, Select, etc.) |
| Resiliência | NetworkStatusBanner (banner offline/online no Layout) |

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

### Docs Extras (docs/)
| Arquivo | O que faz |
|---------|-----------|
| welcome-trips-faq.md | FAQ da Welcome Trips para ferramenta Info do Agent 3 (Julia) |

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
