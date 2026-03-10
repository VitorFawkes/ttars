# 🗺️ CODEBASE.md - WelcomeCRM Knowledge Base

> [!CAUTION]
> **Este arquivo DEVE ser atualizado sempre que algo novo for criado.**
> Use o workflow `/new-module` Phase 5 para manter sincronizado.

> **Purpose:** Source of Truth for the AI Agent. Read this BEFORE any implementation.
> **Last Updated:** 2026-03-10
> **Trigger:** ALWAYS ON
> **Stats:** 112 tabelas | 39 paginas | 69 hooks | 17 views | 422 components

---

## 1. Core Entities (The "Suns")

All tables must FK to at least one of these:

| Entity | Table | Description |
|--------|-------|-------------|
| **Deal** | `cards` | The opportunity/viagem |
| **Person** | `contatos` | The client/traveler |
| **User** | `profiles` | The CRM user (agent) |

**Verified Satellites:**
- `activities` (21.974) → cards, profiles
- `arquivos` → cards
- `tarefas` (19.009) → cards, profiles
- `proposals` ecosystem: `proposals`, `versions`, `sections`, `items`, `library`, `templates`, `comments`, `flights`
- `automation_rules` → cards
- `api_keys` → profiles
- `api_request_logs` → api_keys
- `text_blocks` → profiles

**Integration System (12 tabelas):**
- `integrations` (19) - Configurações de integrações
- `integration_catalog` (1.094) - Catálogo de entidades externas
- `integration_events` (10.488) - Eventos de sync
- `integration_field_map` (65) - Mapeamento de campos inbound
- `integration_outbound_field_map` (19) - Mapeamento outbound
- `integration_outbound_queue` (28) - Fila de sync
- `integration_router_config` (8) - Roteamento de eventos
- `integration_settings` (12) - Configurações
- `integration_stage_map` (16) - Mapeamento de stages
- `integration_inbound_triggers` (1) - Triggers de entrada

**WhatsApp System (8 tabelas):**
- `whatsapp_platforms` (3) - Configurações de plataformas
- `whatsapp_conversations` (1) - Conversas
- `whatsapp_messages` (495) → cards, contatos, profiles
- `whatsapp_raw_events` (4.054) - Eventos brutos
- `whatsapp_custom_fields` (1) - Campos customizados
- `whatsapp_field_mappings` (36) - Mapeamentos
- `whatsapp_linha_config` (4) - Config de linhas
- `whatsapp_phase_instance_map` (2) - Mapeamento de fases

**Workflow System (5 tabelas):**
- `workflows` (5) - Definições de workflows
- `workflow_nodes` (31) - Nós do workflow
- `workflow_edges` (26) - Conexões entre nós
- `workflow_instances` (109) - Instâncias ativas
- `workflow_queue` (43.106) - Fila de execução
- `workflow_log` (132.757) - Logs de execução

**Cadence System (6 tabelas):**
- `cadence_templates` - Templates de cadência com day_pattern, schedule_mode
- `cadence_steps` - Steps das cadências (task/wait/end) com day_offset
- `cadence_instances` - Instâncias de cadência por card
- `cadence_queue` - Fila de execução de steps
- `cadence_event_triggers` - **Regras de entrada** (quando → então)
- `cadence_entry_queue` - Fila de processamento de entry triggers

---

## 2. Modular Section System

### 2.1 Database Tables

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `sections` | Section definitions | `key`, `label`, `position`, `is_governable`, `widget_component` |
| `system_fields` | Field dictionary | `key`, `label`, `type`, `section`, `options` |
| `stage_field_config` | Field rules per stage | `stage_id`, `field_key`, `is_visible`, `is_required`, `show_in_header` |

### 2.2 Active Sections (from DB)

| Key | Label | Position | Governable | Widget |
|-----|-------|----------|------------|--------|
| `observacoes_criticas` | Informações Importantes | left_column | ✅ | - |
| `trip_info` | Informações da Viagem | right_column | ✅ | - |
| `people` | Pessoas / Viajantes | right_column | ❌ | - |
| `payment` | Pagamento | right_column | ❌ | - |
| `proposta` | Propostas | right_column | ❌ | `proposals` |
| `marketing` | Marketing & Origem | right_column | ✅ | - |
| `marketing_informacoes_preenchidas` | Marketing & Info Preenchidas | right_column | ✅ | - |
| `system` | Sistema / Interno | right_column | ❌ | - |

### 2.3 Field Types (system_fields.type)

| Type | Description | Component | Example |
|------|-------------|-----------|---------|
| `text` | Single line text | Input | "Nome do cliente" |
| `textarea` | Multi-line text | Textarea | "Observações" |
| `number` | Numeric value | Input[number] | "Quantidade" |
| `date` | Single date | Input[date] | "Data de nascimento" |
| `datetime` | Date with time | Input[datetime-local] | "Data da reunião" |
| `date_range` | Start/end dates | 2x Input[date] | "Período de férias" |
| `currency` | Money value (BRL) | Input + R$ prefix | "Valor do serviço" |
| `currency_range` | Min/max values | 2x Input + R$ | "Faixa de preço" |
| `select` | Single option | Select | "Status" |
| `multiselect` | Multiple options | Chip buttons | "Interesses" |
| `checklist` | Checkable items | Checkbox list | "Documentos" |
| `boolean` | Yes/No | Checkbox | "Confirmado?" |
| `json` | Raw JSON | Textarea | "Dados customizados" |
| `loss_reason_selector` | Loss reason picker | Custom select | "Motivo da perda" |
| **`flexible_date`** | **Flexible date picker** | **FlexibleDateField** | **Época da viagem** |
| **`flexible_duration`** | **Flexible duration** | **FlexibleDurationField** | **Duração da viagem** |
| **`smart_budget`** | **Smart budget field** | **SmartBudgetField** | **Orçamento** |

#### New Flexible Types (2026-02)

**flexible_date** - Aceita múltiplos formatos de data:
- `data_exata`: Datas específicas (ex: 15/06/2025 a 20/06/2025)
- `mes`: Mês único (ex: Setembro 2025)
- `range_meses`: Range de meses (ex: Agosto a Novembro 2025)
- `indefinido`: Cliente não definiu ainda

**flexible_duration** - Aceita múltiplos formatos de duração:
- `fixo`: Dias fixos (ex: 7 dias)
- `range`: Range de dias (ex: 5 a 7 dias)
- `indefinido`: Cliente não definiu ainda

**smart_budget** - Orçamento inteligente com cálculo automático:
- `total`: Valor total do grupo (ex: R$ 15.000)
- `por_pessoa`: Valor por viajante (ex: R$ 3.000/pessoa)
- `range`: Faixa de valor (ex: R$ 10.000 a R$ 15.000)
- Auto-calcula total ↔ por_pessoa baseado em quantidade_viajantes

**Colunas Normalizadas (para relatórios):**
- `cards.epoca_mes_inicio`, `cards.epoca_mes_fim`, `cards.epoca_ano`
- `cards.duracao_dias_min`, `cards.duracao_dias_max`
- `cards.valor_estimado` (sincronizado de smart_budget.total_calculado)

#### Field Lock System (Bloqueio de Atualização Automática)

**Coluna:** `cards.locked_fields` (JSONB)

Permite bloquear campos individuais para impedir atualizações automáticas via integrações (n8n/ActiveCampaign).

**Estrutura:**
```json
{
  "destinos": true,      // Campo bloqueado
  "orcamento": true,     // Campo bloqueado
  "epoca_viagem": false  // Campo liberado (ou ausente)
}
```

**Componentes:**
| Componente | Path | Função |
|------------|------|--------|
| `FieldLockButton` | `src/components/card/FieldLockButton.tsx` | Botão de cadeado para lock/unlock |
| `useFieldLock` | `src/hooks/useFieldLock.ts` | Hook para gerenciar estado de lock |

**Integração com Backend:**
- `integration-process/index.ts` verifica `locked_fields` antes de atualizar cada campo
- Se `locked_fields[fieldKey] === true`, a atualização é ignorada

---

### 2.4 Frontend Hooks (COMPLETE - 38 hooks)

#### Section & Field Management
| Hook | File | Purpose |
|------|------|---------|
| `useSections()` | `useSections.ts` | Fetch all active sections |
| `useSectionsByPosition()` | `useSections.ts` | Filter by left/right |
| `useGovernableSections()` | `useSections.ts` | Filter governable only |
| `useFieldConfig()` | `useFieldConfig.ts` | Field visibility/required per stage |
| `useStageRequiredFields()` | `useStageRequiredFields.ts` | Required fields for stage |
| `useStageRequirements()` | `useStageRequirements.ts` | Validador completo de requisitos (fields, proposals, tasks, rules) |

#### Pipeline & Cards
| Hook | File | Purpose |
|------|------|---------|
| `usePipelineStages()` | `usePipelineStages.ts` | Pipeline stages data |
| `usePipelinePhases()` | `usePipelinePhases.ts` | Pipeline phases data |
| `usePipelineFilters()` | `usePipelineFilters.ts` | Zustand store para filtros do Kanban (persisted) |
| `usePipelineCards()` | `usePipelineCards.ts` | **Query de cards com filtros (view_cards_acoes)** |
| `useCardContacts()` | `useCardContacts.ts` | Contacts linked to card |
| `useCardPeople()` | `useCardPeople.ts` | People on a card |
| `useCardCreationRules()` | `useCardCreationRules.ts` | Who can create cards where |
| `useDeleteCard()` | `useDeleteCard.ts` | Card deletion logic |
| `useArchiveCard()` | `useArchiveCard.ts` | **Card archive/unarchive logic** |
| `useQualityGate()` | `useQualityGate.ts` | Stage transition validation |
| `useFilterOptions()` | `useFilterOptions.ts` | Filter options for pipeline |
| `useTrips()` | `useTrips.ts` | ⚠️ **LEGADO** - Query de viagens ganhas (usar /leads) |
| `useTripsFilters()` | `useTripsFilters.ts` | ⚠️ **LEGADO** - Zustand store para filtros de viagens |
| `useSubCards()` | `useSubCards.ts` | **Sub-cards CRUD (change requests)** |
| `useSubCardParent()` | `useSubCards.ts` | Get parent info for sub-cards |
| `useFieldLock()` | `useFieldLock.ts` | **Gerencia bloqueio de campos (locked_fields)** |

#### Proposals
| Hook | File | Purpose |
|------|------|---------|
| `useProposals()` | `useProposals.ts` | Proposal CRUD |
| `useProposal()` | `useProposal.ts` | Single proposal |
| `useProposalBuilder()` | `useProposalBuilder.ts` | Builder logic |
| `useProposalTemplates()` | `useProposalTemplates.ts` | Templates |
| `useProposalNotifications()` | `useProposalNotifications.ts` | Notifications |
| `useContactProposals()` | `useContactProposals.ts` | Proposals by contact |
| `useGeneratePDF()` | `useGeneratePDF.ts` | PDF generation |

#### Users & Teams
| Hook | File | Purpose |
|------|------|---------|
| `useUsers()` | `useUsers.ts` | User management |
| `useTeams()` | `useTeams.ts` | Team management |
| `useRoles()` | `useRoles.ts` | Role management |
| `useDepartments()` | `useDepartments.ts` | Departments |

#### AI & Search
| Hook | File | Purpose |
|------|------|---------|
| `useAIExtract()` | `useAIExtract.ts` | AI data extraction |
| `useGlobalSearch()` | `useGlobalSearch.ts` | Global search |
| `usePeopleIntelligence()` | `usePeopleIntelligence.ts` | People analytics |

#### UI & UX
| Hook | File | Purpose |
|------|------|---------|
| `useAutoSave()` | `useAutoSave.ts` | Auto-save functionality |
| `useKeyboardShortcuts()` | `useKeyboardShortcuts.ts` | Global shortcuts |
| `useBuilderKeyboardShortcuts()` | `useBuilderKeyboardShortcuts.ts` | Builder shortcuts |
| `useHorizontalScroll()` | `useHorizontalScroll.ts` | Horizontal scroll |
| `useBlockDragDrop()` | `useBlockDragDrop.ts` | Drag and drop |

#### Other
| Hook | File | Purpose |
|------|------|---------|
| `useApiKeys()` | `useApiKeys.ts` | API key management |
| `useLibrary()` | `useLibrary.ts` | Library assets |
| `useProductContext()` | `useProductContext.ts` | Product context |

### 2.4 Admin Components

| Component | Path | Function |
|-----------|------|----------|
| `SectionManager` | `src/components/admin/studio/SectionManager.tsx` | CRUD sections |
| `DynamicSection` | `src/components/card/DynamicSection.tsx` | Render section with fields |
| `DynamicSectionWidget` | `src/components/card/DynamicSectionWidget.tsx` | Render specialized widgets |
| `DeveloperDocs` | `src/pages/DeveloperDocs.tsx` | **Swagger UI API Documentation** |

---

## 3. Layout System

### 3.1 Main Layout

| Component | Path | Usage |
|-----------|------|-------|
| `Layout` | `src/components/layout/Layout.tsx` | **MAIN APP LAYOUT** |
| `Sidebar` | `src/components/layout/Sidebar.tsx` | Navigation |
| `Header` | `src/components/layout/Header.tsx` | Top bar |

### 3.2 Specialized Layouts

| Layout | Path | Context |
|--------|------|---------|
| `StudioLayout` | `src/components/admin/studio/StudioLayout.tsx` | Admin/Studio pages |
| `SettingsLayout` | `src/components/settings/layout/SettingsLayout.tsx` | Settings pages |
| `GroupDetailLayout` | `src/components/cards/group/GroupDetailLayout.tsx` | Group detail view |

### 3.3 All Pages (COMPLETE - 28 pages)

#### Core Pages (8)
| Page | Path | Route | Description |
|------|------|-------|-------------|
| `CardDetail` | `src/pages/CardDetail.tsx` | `/cards/:id` | **360° Deal View** |
| `Pipeline` | `src/pages/Pipeline.tsx` | `/pipeline` | Kanban board |
| `Dashboard` | `src/pages/Dashboard.tsx` | `/dashboard` | Main dashboard |
| `People` | `src/pages/People.tsx` | `/people` | Contacts list |
| `Leads` | `src/pages/Leads.tsx` | `/leads` | **Gestão de Leads (principal)** |
| `Tasks` | `src/pages/Tasks.tsx` | `/tasks` | Task management |
| `ActivitiesPage` | `src/pages/ActivitiesPage.tsx` | `/activities` | Activities view |
| `GroupsPage` | `src/pages/GroupsPage.tsx` | `/groups` | Groups management |

#### Proposals (5)
| Page | Path | Route | Description |
|------|------|-------|-------------|
| `ProposalsPage` | `src/pages/ProposalsPage.tsx` | `/proposals` | Proposals list |
| `ProposalBuilderV4` | `src/pages/ProposalBuilderV4.tsx` | `/proposals/:id/v4` | **Latest proposal builder** |
| `ProposalBuilderV3` | `src/pages/ProposalBuilderV3.tsx` | `/proposals/:id/v3` | Legacy builder v3 |
| `ProposalBuilderElite` | `src/pages/ProposalBuilderElite.tsx` | `/proposals/:id/elite` | Elite builder |
| `ProposalBuilder` | `src/pages/ProposalBuilder.tsx` | `/proposals/:id/edit` | Original builder |

#### Admin Pages (11)
| Page | Path | Route | Description |
|------|------|-------|-------------|
| `PipelineStudio` | `src/pages/admin/PipelineStudio.tsx` | `/settings/pipeline/structure` | Pipeline configuration |
| `UserManagement` | `src/pages/admin/UserManagement.tsx` | `/settings/team/members` | User admin |
| `CardCreationRulesPage` | `src/pages/admin/CardCreationRulesPage.tsx` | `/settings/team/card-rules` | Creation rules |
| `CategoryManagement` | `src/pages/admin/CategoryManagement.tsx` | `/settings/customization/categories` | Categories |
| `CRMHealth` | `src/pages/admin/CRMHealth.tsx` | `/settings/operations/health` | System health |
| `Lixeira` | `src/pages/admin/Lixeira.tsx` | `/settings/operations/trash` | Trash/recycle bin |
| `LossReasonManagement` | `src/pages/admin/LossReasonManagement.tsx` | `/settings/customization/loss-reasons` | **Motivos de perda** |
| `WorkflowBuilderPage` | `src/pages/admin/WorkflowBuilderPage.tsx` | `/settings/workflows/builder/:id?` | **Visual workflow builder** |
| `WorkflowListPage` | `src/pages/admin/WorkflowListPage.tsx` | `/settings/workflows` | **Lista de workflows** |
| `CadenceListPage` | `src/pages/admin/cadence/CadenceListPage.tsx` | `/settings/cadence` | **Lista de cadências + regras de entrada** |
| `CadenceBuilderPage` | `src/pages/admin/cadence/CadenceBuilderPage.tsx` | `/settings/cadence/:id` | **Builder de cadências com day patterns** |

#### Developer (1)
| Page | Path | Route | Description |
|------|------|-------|-------------|
| `DeveloperHub` | `src/pages/developer/DeveloperHub.tsx` | `/settings/developer-platform` | API keys, Swagger UI |

#### Public Pages - No Auth (3)
| Page | Path | Route | Description |
|------|------|-------|-------------|
| `ProposalView` | `src/pages/public/ProposalView.tsx` | `/p/:token` | Public proposal view |
| `ProposalReview` | `src/pages/public/ProposalReview.tsx` | `/p/:token/review` | Client review |
| `ProposalConfirmed` | `src/pages/public/ProposalConfirmed.tsx` | `/p/:token/confirmed` | Confirmation |

#### Auth & Settings (2)
| Page | Path | Route | Description |
|------|------|-------|-------------|
| `Login` | `src/pages/Login.tsx` | `/login` | Authentication |
| `InvitePage` | `src/pages/InvitePage.tsx` | `/invite/:token` | User invitation |

#### Páginas Legadas (NÃO UTILIZAR)
> **AVISO:** Estas páginas existem no código mas foram substituídas. Não criar links para elas.

| Page | Path | Route | Substituída por | Motivo |
|------|------|-------|-----------------|--------|
| `Cards` (Trips) | `src/pages/Cards.tsx` | `/trips` | `/leads` com filtro `status_comercial=ganho` | Redundante - /leads já cobre viagens ganhas |

---

## 4. UI Component Library

### 4.1 Mandatory Components (`src/components/ui/`)

| Component | File | Use For |
|-----------|------|---------|
| `Input` | `Input.tsx` | All text inputs |
| `Select` | `Select.tsx` | Dropdowns |
| `Button` | `Button.tsx` | All buttons |
| `Table` | `Table.tsx` | Data tables |
| `Textarea` | `textarea.tsx` | Multiline text |
| `ThemeBoundary` | `ThemeBoundary.tsx` | Dark mode containers |

### 4.2 Style Tokens

```css
/* Light Mode (Default) */
bg-white border-slate-200 shadow-sm text-slate-900

/* Dark Mode (Inside ThemeBoundary mode="dark") */
bg-white/10 border-white/20 text-white
```

---

## 5. Pipeline System

### 5.1 Tables

| Table | Purpose |
|-------|---------|
| `pipelines` | Pipeline definitions |
| `pipeline_phases` | Phases (groups of stages) |
| `pipeline_stages` | Individual stages |
| `card_creation_rules` | Who can create cards where |
| `teams` | Team definitions |
| `team_members` | User-team relationships |
| `roles` | Role definitions |

### 5.2 Stage Transitions

Cards move through stages. Each stage can have:
- Different visible fields (`stage_field_config`)
- Required fields for progression
- Quality gates (blocking rules)

---

## 6. Integration System

### 6.1 Tables

| Table | Purpose |
|-------|---------|
| `integration_connections` | Active integrations |
| `integration_field_map` | Inbound field mappings |
| `integration_outbound_field_map` | Outbound mappings |
| `integration_field_catalog` | Available fields per integration |
| `whatsapp_platforms` | WhatsApp configurations |
| `whatsapp_platforms` | WhatsApp configurations |
| `whatsapp_messages` | Message history |
| `integration_outbound_queue` | Queue for sync events (RLS: Auth Insert Allowed) |

### 6.2 Public API (Edge Functions)

> **Tech Stack:** Hono + Zod + OpenAPI

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/deals` | GET, POST | Manage deals |
| `/contacts` | GET, POST | Manage contacts |
| `/openapi.json` | GET | OpenAPI 3.0 Spec |
| `/cadence-engine` | POST | Cadence processing engine (Internal) |

**Authentication:** `X-API-Key` header required for all endpoints (except health/docs).

**Authentication:** `X-API-Key` header required for all endpoints (except health/docs).

### 6.3 Integration Architecture (Sync Flow)

> **Critical Security Note:** The `integration_outbound_queue` table has a special RLS policy allowing `INSERT` for `authenticated` users. This is required because triggers like `trg_card_outbound_sync` execute in the user's context but need to queue system events.

**Outbound Flow:**
1. User updates Card (with `external_id`)
2. Trigger `trg_card_outbound_sync` fires
3. Trigger inserts into `integration_outbound_queue`
4. Edge Function processes queue asynchronously

---

## 7. File Dependencies (Before Editing)

### 7.1 If Modifying `sections` table
- Update `src/hooks/useSections.ts` types if needed
- Check `src/components/admin/studio/SectionManager.tsx`
- Verify `src/components/card/DynamicSection.tsx`

### 7.2 If Adding New Section
1. Insert into `sections` table
2. Define fields in `system_fields`
3. Configure visibility in `stage_field_config`
4. Add to `CardDetail.tsx` if custom widget needed

### 7.3 If Modifying Pipeline Stages
- Update `stage_field_config` for new stage
- Check `card_creation_rules` if affecting creation

---

## 8. Quick Reference Commands

```bash
# Regenerate types after DB changes
npx supabase gen types typescript --project-id szyrzxvlptqqheizyrxu > src/database.types.ts

# Run dev server
npm run dev

# Build for production
npm run build
```

---

## 9. Componentes Críticos (Comportamento Importante)

### CardHeader.tsx
- **Edição de título:** Inline editing com mutation
- **Mudança de etapa:** Dropdown ordenado por fase, valida quality gate antes de mover
- **Seleção de owners:** SDR, Planner, Pós-Venda (baseado na fase)
- **Quality Gate:** Usa `useQualityGate().validateMoveSync()` antes de permitir mudança

### KanbanBoard.tsx
- **Drag-drop:** @dnd-kit para arrastar cards entre etapas
- **RPC de mover:** Usa `mover_card(p_card_id, p_nova_etapa_id, p_motivo_perda_id?, p_motivo_perda_comentario?)`
- **Validações:** Quality gate, governance rules, loss reason
- **Scroll horizontal:** `useHorizontalScroll()` com drag-to-pan

### KanbanCard.tsx
- **Campos dinâmicos:** Renderiza baseado em `pipeline_card_settings.campos_kanban`
- **Field registry:** Usa `fieldRegistry.ts` para componentes de campo
- **Tipos suportados:** currency, date, select, boolean, numeric, text

### CreateCardModal.tsx
- **Allowed stages:** Usa `useAllowedStages(product)` baseado no time do usuário
- **Auto-select:** Primeira etapa permitida é selecionada automaticamente
- **Owner default:** `dono_atual_id = profile.id` do usuário logado

### Cadence System Components

#### CadenceListPage.tsx
- **Tabs:** Templates, Regras de Entrada, Monitor Global
- **URL state:** Tab ativa via `?tab=` query param
- **Stats cards:** Templates ativos, instâncias ativas, concluídas, na fila

#### CadenceEntryRulesTab.tsx
- **Padrão:** QUANDO (evento) → ENTÃO (ação)
- **Eventos:** `card_created`, `stage_enter`
- **Ações:** `create_task`, `start_cadence`
- **Filtros:** pipeline_ids/stage_ids null = qualquer

#### CadenceBuilderPage.tsx
- **Tabs:** Steps, Agendamento, Visualizar
- **schedule_mode:** `interval` (tradicional) ou `day_pattern`
- **day_pattern:** `{ days: [1,2,3,5,8], description: "..." }`
- **requires_previous_completed:** Step só executa se anterior foi concluída

#### DayPatternEditor.tsx
- **Presets:** "3 dias seguidos", "Dias alternados", "3+1+1 (padrão SDR)"
- **Click to toggle:** Dias 1-14 clicáveis
- **Preview:** Mostra timeline visual dos dias

#### CadenceTimeline.tsx
- **Cores:** Task=blue, Wait=amber, End=green/red
- **Timing:** Mostra "Dia X" ou "+Xh" baseado no schedule_mode
- **Summary:** Conta tarefas, pausas, dias total

### Sub-Cards System (Change Requests)

**Purpose:** Allow change requests during Pós-venda without losing control of the main card.

#### Database Schema
| Column | Type | Description |
|--------|------|-------------|
| `card_type` | TEXT | 'standard', 'group_child', 'sub_card' |
| `sub_card_mode` | TEXT | 'incremental' (soma) ou 'complete' (substitui) |
| `sub_card_status` | TEXT | 'active', 'merged', 'cancelled' |
| `merged_at` | TIMESTAMPTZ | Data do merge |
| `merged_by` | UUID | Quem fez o merge |
| `merge_metadata` | JSONB | Detalhes do merge |

#### Tables
| Table | Purpose |
|-------|---------|
| `sub_card_sync_log` | Auditoria de sincronizações |

#### RPCs
| Function | Description |
|----------|-------------|
| `criar_sub_card(parent_id, titulo, descricao, mode)` | Cria sub-card vinculado |
| `merge_sub_card(sub_card_id, options)` | Integra sub-card ao pai |
| `cancelar_sub_card(sub_card_id, motivo)` | Cancela sem merge |
| `get_sub_cards(parent_id)` | Lista sub-cards do pai |

#### Components
| Component | Path | Function |
|-----------|------|----------|
| `CreateSubCardModal` | `src/components/card/CreateSubCardModal.tsx` | Modal de criação |
| `SubCardBadge` | `src/components/pipeline/SubCardBadge.tsx` | Badge no KanbanCard |
| `SubCardsList` | `src/components/card/SubCardsList.tsx` | Lista no CardDetail |
| `MergeSubCardModal` | `src/components/card/MergeSubCardModal.tsx` | Modal de merge |

#### Business Rules
1. **Criação:** Apenas de cards em Pós-venda
2. **Modos:**
   - `incremental`: Valor começa ZERADO, merge SOMA ao pai
   - `complete`: Copia TUDO, merge SUBSTITUI o pai
3. **Nascimento:** Sub-card nasce na primeira etapa da fase Planner
4. **Taxa:** Sub-cards ignoram validação de taxa (já paga no pai)
5. **Kanban:** Sub-cards ativos aparecem no Kanban, merged/cancelled não
6. **Card pai perdido:** Cancela sub-cards ativos automaticamente
7. **Tarefa:** Cria tarefa `tipo='solicitacao_mudanca'` no card pai

---

## 10. Critical Rules Summary

1. **No DashboardLayout** → Use `Layout`
2. **No DataTable** → Use `Table`
3. **No SmartForm** → Use UI components directly
4. **No ContactProfile** → Component doesn't exist yet
5. **CardDetail is in `pages/`** → Not in `components/cards/`
6. **Always use hooks** → `useSections()`, `useFieldConfig()` for dynamic data
7. **ProposalBuilderV4** → Latest version, use this for new features
8. **Mover card** → Sempre via RPC `mover_card`, nunca UPDATE direto
9. **Quality Gate** → Validar antes de mover para nova etapa
10. **Campos dinâmicos** → Via `pipeline_card_settings` + `system_fields`

---

## 11. Mapa de Dependencias Criticas

### 11.1 Tabelas → Hooks → Paginas

| Tabela | Hooks que Usam | Paginas Afetadas |
|--------|----------------|------------------|
| `cards` | usePipelineCards, useCardContacts, useTrips, useSubCards | Pipeline, CardDetail, Dashboard, Trips |
| `contatos` | useContacts, useCardPeople | People, CardDetail |
| `pipeline_stages` | usePipelineStages, useQualityGate, useAllowedStages | Pipeline, CreateCardModal, CardHeader |
| `proposals` | useProposals, useProposalBuilder | ProposalBuilderV4, CardDetail |
| `tarefas` | useTasks, useCardTasks | CardDetail, Tasks |
| `system_fields` | useFieldConfig, useStageRequiredFields | CardDetail (todas as sections) |

### 11.2 Views Criticas

| View | Usado Por | Se Modificar... |
|------|-----------|-----------------|
| `view_cards_acoes` | usePipelineCards, Pipeline | Impacta TODO o Kanban |
| `view_contacts_full` | useContacts | Impacta lista de Pessoas |
| `view_card_360` | CardDetail | Impacta pagina de detalhes |

### 11.3 Componentes Core

| Componente | Usado Em | Impacto |
|------------|----------|---------|
| `KanbanBoard` | Pipeline | Todo o fluxo de cards |
| `CardHeader` | CardDetail | Titulo, fase, owner |
| `SectionRenderer` | CardDetail | Todas as secoes dinamicas |
| `CreateCardModal` | Pipeline, Dashboard | Criacao de novos cards |

