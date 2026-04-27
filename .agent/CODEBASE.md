# 🗺️ CODEBASE.md - WelcomeCRM Knowledge Base

> [!CAUTION]
> **Este arquivo DEVE ser atualizado sempre que algo novo for criado.**
> Use o workflow `/new-module` Phase 5 para manter sincronizado.

> **Purpose:** Source of Truth for the AI Agent. Read this BEFORE any implementation.
> **Last Updated:** 2026-04-27
> **Trigger:** ALWAYS ON
> **Stats:** 192 tabelas | 140 paginas | 156 hooks | 20 views | 613 components

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

### 2.4 Frontend Hooks (AUTO-GENERATED)

> **156 hooks** escaneados de `src/hooks/*.ts` — atualizado automaticamente via `npm run sync:fix`

#### AI & Search
| Hook | File |
|------|------|
| `useAIConversationExtraction()` | `useAIConversationExtraction.ts` |
| `useAIExtract()` | `useAIExtract.ts` |
| `useAIExtraction()` | `useAIExtraction.ts` |
| `useAIExtractionReview()` | `useAIExtractionReview.ts` |
| `useAiAgentHealth()` | `useAiAgentHealth.ts` |
| `useAiAgentHubStats()` | `useAiAgentHubStats.ts` |
| `useAiAgentPresentations()` | `useAiAgentPresentations.ts` |
| `useAiAgents()` | `useAiAgents.ts` |
| `useAiConversations()` | `useAiConversations.ts` |
| `useAiKnowledgeBases()` | `useAiKnowledgeBases.ts` |
| `useAiSkills()` | `useAiSkills.ts` |
| `useBriefingIA()` | `useBriefingIA.ts` |
| `useChatIA()` | `useChatIA.ts` |
| `useEmailNotificationPreferences()` | `useEmailNotificationPreferences.ts` |
| `useGlobalSearch()` | `useGlobalSearch.ts` |
| `useHotelSearch()` | `useHotelSearch.ts` |
| `useIterpecSearch()` | `useIterpecSearch.ts` |
| `useMondeSearch()` | `useMondeSearch.ts` |
| `useReactivationChat()` | `useReactivationChat.ts` |
| `useUnifiedSearch()` | `useUnifiedSearch.ts` |
| `useVoucherExtraction()` | `useVoucherExtraction.ts` |

#### Analytics
| Hook | File |
|------|------|
| `useAnalyticsV2Permissions()` | `useAnalyticsV2Permissions.ts` |
| `useFinancialItemPassengers()` | `useFinancialItemPassengers.ts` |
| `useWhatsAppLinhas()` | `useWhatsAppLinhas.ts` |
| `useWhatsAppTemplates()` | `useWhatsAppTemplates.ts` |

#### Calendar
| Hook | File |
|------|------|
| `useBlockDragDrop()` | `useBlockDragDrop.ts` |

#### Contacts
| Hook | File |
|------|------|
| `useContactGifts()` | `useContactGifts.ts` |
| `useContactQuality()` | `useContactQuality.ts` |
| `useDeleteContact()` | `useDeleteContact.ts` |
| `useDuplicateDetection()` | `useDuplicateDetection.ts` |
| `usePeopleIntelligence()` | `usePeopleIntelligence.ts` |
| `useQualityGate()` | `useQualityGate.ts` |

#### Integrations
| Hook | File |
|------|------|
| `useIntegrationHealth()` | `useIntegrationHealth.ts` |
| `useIntegrationProviders()` | `useIntegrationProviders.ts` |
| `useIntegrationStats()` | `useIntegrationStats.ts` |

#### Other
| Hook | File |
|------|------|
| `useAgentBusinessConfig()` | `useAgentBusinessConfig.ts` |
| `useAgentKBLinks()` | `useAgentKBLinks.ts` |
| `useAgentQualificationFlow()` | `useAgentQualificationFlow.ts` |
| `useAgentScoring()` | `useAgentScoring.ts` |
| `useAgentSimulator()` | `useAgentSimulator.ts` |
| `useAgentSpecialScenarios()` | `useAgentSpecialScenarios.ts` |
| `useAgentTemplates()` | `useAgentTemplates.ts` |
| `useAgentWizard()` | `useAgentWizard.ts` |
| `useAllGiftAssignments()` | `useAllGiftAssignments.ts` |
| `useApiKeys()` | `useApiKeys.ts` |
| `useAssistNotifications()` | `useAssistNotifications.ts` |
| `useAutoCalcTripDate()` | `useAutoCalcTripDate.ts` |
| `useAutoMergePreflight()` | `useAutoMergePreflight.ts` |
| `useAutoSave()` | `useAutoSave.ts` |
| `useAutomations()` | `useAutomations.ts` |
| `useBulkGiftStatus()` | `useBulkGiftStatus.ts` |
| `useBulkLeadActions()` | `useBulkLeadActions.ts` |
| `useContatoChangeLog()` | `useContatoChangeLog.ts` |
| `useCurrentProductMeta()` | `useCurrentProductMeta.ts` |
| `useDateFeatureSettings()` | `useDateFeatureSettings.ts` |
| `useFlightLookup()` | `useFlightLookup.ts` |
| `useFutureOpportunities()` | `useFutureOpportunities.ts` |
| `useGiftMetrics()` | `useGiftMetrics.ts` |
| `useHorizontalScroll()` | `useHorizontalScroll.ts` |
| `useInventoryMovements()` | `useInventoryMovements.ts` |
| `useInventoryProducts()` | `useInventoryProducts.ts` |
| `useInventoryStats()` | `useInventoryStats.ts` |
| `useKeyboardShortcuts()` | `useKeyboardShortcuts.ts` |
| `useLeadQuickUpdate()` | `useLeadQuickUpdate.ts` |
| `useLeadsColumns()` | `useLeadsColumns.ts` |
| `useLeadsQuery()` | `useLeadsQuery.ts` |
| `useMensagemTemplates()` | `useMensagemTemplates.ts` |
| `useMondePendingSales()` | `useMondePendingSales.ts` |
| `useMondeSales()` | `useMondeSales.ts` |
| `useMyDayOpportunities()` | `useMyDayOpportunities.ts` |
| `useMyDayTasks()` | `useMyDayTasks.ts` |
| `useMyVisiblePhases()` | `useMyVisiblePhases.ts` |
| `useNetworkStatus()` | `useNetworkStatus.ts` |
| `useNotificationConfig()` | `useNotificationConfig.ts` |
| `useNotifications()` | `useNotifications.ts` |
| `useOrgBranding()` | `useOrgBranding.ts` |
| `useOrgMembers()` | `useOrgMembers.ts` |
| `useOrgSwitch()` | `useOrgSwitch.ts` |
| `useOrganizations()` | `useOrganizations.ts` |
| `useOutboundQueue()` | `useOutboundQueue.ts` |
| `usePhaseCapabilities()` | `usePhaseCapabilities.ts` |
| `usePhaseSort()` | `usePhaseSort.ts` |
| `usePhaseVisibilityRules()` | `usePhaseVisibilityRules.ts` |
| `usePlatformAdmin()` | `usePlatformAdmin.ts` |
| `usePlatformData()` | `usePlatformData.ts` |
| `usePosVendaAlert()` | `usePosVendaAlert.ts` |
| `usePremiumGifts()` | `usePremiumGifts.ts` |
| `useProductContext()` | `useProductContext.ts` |
| `useProductScopedSettings()` | `useProductScopedSettings.ts` |
| `useProducts()` | `useProducts.ts` |
| `usePushNotifications()` | `usePushNotifications.ts` |
| `useReactivationActions()` | `useReactivationActions.ts` |
| `useReactivationFacets()` | `useReactivationFacets.ts` |
| `useReactivationPatterns()` | `useReactivationPatterns.ts` |
| `useReceitaPermission()` | `useReceitaPermission.ts` |
| `useResetAgentConversations()` | `useResetAgentConversations.ts` |
| `useScheduledJobs()` | `useScheduledJobs.ts` |
| `useTaskOutcomes()` | `useTaskOutcomes.ts` |
| `useTasksList()` | `useTasksList.ts` |
| `useTemplateUsages()` | `useTemplateUsages.ts` |
| `useTripPlan()` | `useTripPlan.ts` |
| `useTripPlanApprovals()` | `useTripPlanApprovals.ts` |
| `useTripPlanBlocks()` | `useTripPlanBlocks.ts` |
| `useTripPlanEditor()` | `useTripPlanEditor.ts` |
| `useTrips()` | `useTrips.ts` |

#### Pipeline & Cards
| Hook | File |
|------|------|
| `useArchiveCard()` | `useArchiveCard.ts` |
| `useAssistedCardIds()` | `useAssistedCardIds.ts` |
| `useCardAlertRules()` | `useCardAlertRules.ts` |
| `useCardAlerts()` | `useCardAlerts.ts` |
| `useCardAttachments()` | `useCardAttachments.ts` |
| `useCardContactNames()` | `useCardContactNames.ts` |
| `useCardCreationRules()` | `useCardCreationRules.ts` |
| `useCardGifts()` | `useCardGifts.ts` |
| `useCardPeople()` | `useCardPeople.ts` |
| `useCardRulesSettings()` | `useCardRulesSettings.ts` |
| `useCardTags()` | `useCardTags.ts` |
| `useCardTeam()` | `useCardTeam.ts` |
| `useCardTeamCounts()` | `useCardTeamCounts.ts` |
| `useContactAvailableCards()` | `useContactAvailableCards.ts` |
| `useDeleteCard()` | `useDeleteCard.ts` |
| `useDuplicateCardDetection()` | `useDuplicateCardDetection.ts` |
| `useFilterOptions()` | `useFilterOptions.ts` |
| `useLeadsFilters()` | `useLeadsFilters.ts` |
| `useMyAssistCardIds()` | `useMyAssistCardIds.ts` |
| `usePipelineCards()` | `usePipelineCards.ts` |
| `usePipelineFilters()` | `usePipelineFilters.ts` |
| `usePipelineListCards()` | `usePipelineListCards.ts` |
| `usePipelinePhases()` | `usePipelinePhases.ts` |
| `usePipelineStages()` | `usePipelineStages.ts` |
| `usePipelines()` | `usePipelines.ts` |
| `usePromoteSubCard()` | `usePromoteSubCard.ts` |
| `useRecordCardOpen()` | `useRecordCardOpen.ts` |
| `useSeenCards()` | `useSeenCards.ts` |
| `useStageFieldConfirmations()` | `useStageFieldConfirmations.ts` |
| `useStageRequirements()` | `useStageRequirements.ts` |
| `useStageSectionConfig()` | `useStageSectionConfig.ts` |
| `useSubCards()` | `useSubCards.ts` |
| `useTaskFilters()` | `useTaskFilters.ts` |
| `useTeamFilterMembers()` | `useTeamFilterMembers.ts` |
| `useTripsFilters()` | `useTripsFilters.ts` |

#### Proposals
| Hook | File |
|------|------|
| `useContactProposals()` | `useContactProposals.ts` |
| `useLibrary()` | `useLibrary.ts` |
| `useProposal()` | `useProposal.ts` |
| `useProposalBuilder()` | `useProposalBuilder.ts` |
| `useProposalNotifications()` | `useProposalNotifications.ts` |
| `useProposalTemplates()` | `useProposalTemplates.ts` |
| `useProposals()` | `useProposals.ts` |

#### Section & Field
| Hook | File |
|------|------|
| `useFieldConfig()` | `useFieldConfig.ts` |
| `useFieldLock()` | `useFieldLock.ts` |
| `useProductRequirements()` | `useProductRequirements.ts` |
| `useSectionFieldConfig()` | `useSectionFieldConfig.ts` |
| `useSections()` | `useSections.ts` |

#### Users & Teams
| Hook | File |
|------|------|
| `useDepartments()` | `useDepartments.ts` |
| `useRoles()` | `useRoles.ts` |
| `useTeams()` | `useTeams.ts` |
| `useUsers()` | `useUsers.ts` |

### 2.4 Admin Components

| Component | Path | Function |
|-----------|------|----------|
| `SectionManager` | `src/components/admin/studio/SectionManager.tsx` | CRUD sections |
| `DynamicSection` | `src/components/card/DynamicSection.tsx` | Render section with fields |
| `DynamicSectionWidget` | `src/components/card/DynamicSectionWidget.tsx` | Render specialized widgets |
| `FutureOpportunitySection` | `src/components/card/FutureOpportunitySection.tsx` | Future opportunity section widget |
| `DeveloperDocs` | `src/pages/DeveloperDocs.tsx` | **Swagger UI API Documentation** |
| `AssistantStatsWidget` | `src/components/dashboard/AssistantStatsWidget.tsx` | Dashboard widget for assistant stats |
| `DuplicateCardBanner` | `src/components/card/DuplicateCardBanner.tsx` | Aviso amarelo de possível duplicata no CreateCardModal |
| `MergeCardsModal` | `src/components/card/MergeCardsModal.tsx` | Modal de agrupar (fundir) cards — busca por contato principal |

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

### 3.3 All Pages (AUTO-GENERATED)

> **140 pages** escaneadas de `src/pages/` — atualizado automaticamente via `npm run sync:fix`

| Page | Path |
|------|------|
| `AlertsPanel` | `src/pages/AnalyticsV2/AlertsPanel.tsx` |
| `AnalyticsV2Page` | `src/pages/AnalyticsV2/AnalyticsV2Page.tsx` |
| `AnalyticsV2Sidebar` | `src/pages/AnalyticsV2/AnalyticsV2Sidebar.tsx` |
| `CardTimelineDrawer` | `src/pages/AnalyticsV2/CardTimelineDrawer.tsx` |
| `ExplorarPage` | `src/pages/AnalyticsV2/ExplorarPage.tsx` |
| `MeuPainelRedirect` | `src/pages/AnalyticsV2/MeuPainelRedirect.tsx` |
| `UniversalFilterBar` | `src/pages/AnalyticsV2/UniversalFilterBar.tsx` |
| `WidgetCard` | `src/pages/AnalyticsV2/WidgetCard.tsx` |
| `ComercialDashboard` | `src/pages/AnalyticsV2/dashboards/ComercialDashboard.tsx` |
| `DonoDashboard` | `src/pages/AnalyticsV2/dashboards/DonoDashboard.tsx` |
| `PosDashboard` | `src/pages/AnalyticsV2/dashboards/PosDashboard.tsx` |
| `SdrDashboard` | `src/pages/AnalyticsV2/dashboards/SdrDashboard.tsx` |
| `VendasDashboard` | `src/pages/AnalyticsV2/dashboards/VendasDashboard.tsx` |
| `CalendarPage` | `src/pages/CalendarPage.tsx` |
| `CardByConversation` | `src/pages/CardByConversation.tsx` |
| `CardDetail` | `src/pages/CardDetail.tsx` |
| `CardViagem` | `src/pages/CardViagem.tsx` |
| `Cards` | `src/pages/Cards.tsx` |
| `CreateCardFromEcho` | `src/pages/CreateCardFromEcho.tsx` |
| `Dashboard` | `src/pages/Dashboard.tsx` |
| `ForgotPassword` | `src/pages/ForgotPassword.tsx` |
| `GroupsPage` | `src/pages/GroupsPage.tsx` |
| `InvitePage` | `src/pages/InvitePage.tsx` |
| `Leads` | `src/pages/Leads.tsx` |
| `Login` | `src/pages/Login.tsx` |
| `MondePreviewPage` | `src/pages/MondePreviewPage.tsx` |
| `People` | `src/pages/People.tsx` |
| `Pipeline` | `src/pages/Pipeline.tsx` |
| `PortalEditor` | `src/pages/PortalEditor.tsx` |
| `PresentesHubPage` | `src/pages/PresentesHubPage.tsx` |
| `ProposalBuilderElite` | `src/pages/ProposalBuilderElite.tsx` |
| `ProposalBuilderV4` | `src/pages/ProposalBuilderV4.tsx` |
| `ProposalsPage` | `src/pages/ProposalsPage.tsx` |
| `ReactivationPage` | `src/pages/ReactivationPage.tsx` |
| `ResetPassword` | `src/pages/ResetPassword.tsx` |
| `SettingsPage` | `src/pages/SettingsPage.tsx` |
| `Tasks` | `src/pages/Tasks.tsx` |
| `ViagemStandalone` | `src/pages/ViagemStandalone.tsx` |
| `ViagensPage` | `src/pages/ViagensPage.tsx` |
| `AiAgentAnalyticsPage` | `src/pages/admin/AiAgentAnalyticsPage.tsx` |
| `AiAgentBuilderWizard` | `src/pages/admin/AiAgentBuilderWizard.tsx` |
| `AiAgentConversationsPage` | `src/pages/admin/AiAgentConversationsPage.tsx` |
| `AiAgentDetailPage` | `src/pages/admin/AiAgentDetailPage.tsx` |
| `AiAgentHealthPage` | `src/pages/admin/AiAgentHealthPage.tsx` |
| `AiAgentListPage` | `src/pages/admin/AiAgentListPage.tsx` |
| `AiKnowledgeBasePage` | `src/pages/admin/AiKnowledgeBasePage.tsx` |
| `AiSkillManagerPage` | `src/pages/admin/AiSkillManagerPage.tsx` |
| `Arquivados` | `src/pages/admin/Arquivados.tsx` |
| `CRMHealth` | `src/pages/admin/CRMHealth.tsx` |
| `CardAlertRulesPage` | `src/pages/admin/CardAlertRulesPage.tsx` |
| `CardCreationRulesPage` | `src/pages/admin/CardCreationRulesPage.tsx` |
| `CategoryManagement` | `src/pages/admin/CategoryManagement.tsx` |
| `DepartmentsManagement` | `src/pages/admin/DepartmentsManagement.tsx` |
| `ImportacaoPosVendaPage` | `src/pages/admin/ImportacaoPosVendaPage.tsx` |
| `Lixeira` | `src/pages/admin/Lixeira.tsx` |
| `LossReasonManagement` | `src/pages/admin/LossReasonManagement.tsx` |
| `MensagemTemplatePage` | `src/pages/admin/MensagemTemplatePage.tsx` |
| `OutboundQueuePage` | `src/pages/admin/OutboundQueuePage.tsx` |
| `PhaseVisibilitySettings` | `src/pages/admin/PhaseVisibilitySettings.tsx` |
| `PipelineStudio` | `src/pages/admin/PipelineStudio.tsx` |
| `ProductsManagement` | `src/pages/admin/ProductsManagement.tsx` |
| `ScheduledJobDetailPage` | `src/pages/admin/ScheduledJobDetailPage.tsx` |
| `ScheduledJobsPage` | `src/pages/admin/ScheduledJobsPage.tsx` |
| `TagManagement` | `src/pages/admin/TagManagement.tsx` |
| `UserManagement` | `src/pages/admin/UserManagement.tsx` |
| `VendasMondePage` | `src/pages/admin/VendasMondePage.tsx` |
| `WorkspaceGeneral` | `src/pages/admin/WorkspaceGeneral.tsx` |
| `AutomationBuilderPage` | `src/pages/admin/automations/AutomationBuilderPage.tsx` |
| `AutomationMonitorPage` | `src/pages/admin/automations/AutomationMonitorPage.tsx` |
| `AutomationsListPage` | `src/pages/admin/automations/AutomationsListPage.tsx` |
| `CronRoteamentoDetailPage` | `src/pages/admin/automations/CronRoteamentoDetailPage.tsx` |
| `NewAutomationPage` | `src/pages/admin/automations/NewAutomationPage.tsx` |
| `AutomacaoBuilderPage` | `src/pages/admin/cadence/AutomacaoBuilderPage.tsx` |
| `CadenceBuilderPage` | `src/pages/admin/cadence/CadenceBuilderPage.tsx` |
| `CadenceMonitorPage` | `src/pages/admin/cadence/CadenceMonitorPage.tsx` |
| `Step1_BusinessIdentity` | `src/pages/admin/wizard/Step1_BusinessIdentity.tsx` |
| `Step2_TemplateSelection` | `src/pages/admin/wizard/Step2_TemplateSelection.tsx` |
| `Step3_FunnelConfiguration` | `src/pages/admin/wizard/Step3_FunnelConfiguration.tsx` |
| `Step4_KnowledgeBase` | `src/pages/admin/wizard/Step4_KnowledgeBase.tsx` |
| `Step5_BusinessRules` | `src/pages/admin/wizard/Step5_BusinessRules.tsx` |
| `Step6_Escalation` | `src/pages/admin/wizard/Step6_Escalation.tsx` |
| `Step7_PreviewDeploy` | `src/pages/admin/wizard/Step7_PreviewDeploy.tsx` |
| `AnalyticsLayout` | `src/pages/analytics-new/AnalyticsLayout.tsx` |
| `AnalyticsRootRedirect` | `src/pages/analytics-new/AnalyticsRootRedirect.tsx` |
| `AnalyticsSidebar` | `src/pages/analytics-new/AnalyticsSidebar.tsx` |
| `CardTimelineDrawer` | `src/pages/analytics-new/CardTimelineDrawer.tsx` |
| `ExplorarPage` | `src/pages/analytics-new/ExplorarPage.tsx` |
| `FinancialView` | `src/pages/analytics-new/FinancialView.tsx` |
| `FunnelView` | `src/pages/analytics-new/FunnelView.tsx` |
| `OperationsView` | `src/pages/analytics-new/OperationsView.tsx` |
| `PipelineView` | `src/pages/analytics-new/PipelineView.tsx` |
| `ResumoView` | `src/pages/analytics-new/ResumoView.tsx` |
| `RetentionView` | `src/pages/analytics-new/RetentionView.tsx` |
| `SLAView` | `src/pages/analytics-new/SLAView.tsx` |
| `SaudeView` | `src/pages/analytics-new/SaudeView.tsx` |
| `TeamView` | `src/pages/analytics-new/TeamView.tsx` |
| `UnderConstruction` | `src/pages/analytics-new/UnderConstruction.tsx` |
| `WhatsAppView` | `src/pages/analytics-new/WhatsAppView.tsx` |
| `WidgetCard` | `src/pages/analytics-new/WidgetCard.tsx` |
| `FunnelFilterPanel` | `src/pages/analytics-new/funil/FunnelFilterPanel.tsx` |
| `FunnelKpis` | `src/pages/analytics-new/funil/FunnelKpis.tsx` |
| `FunnelKpisEditor` | `src/pages/analytics-new/funil/FunnelKpisEditor.tsx` |
| `FunnelLossReasons` | `src/pages/analytics-new/funil/FunnelLossReasons.tsx` |
| `FunnelVelocityTable` | `src/pages/analytics-new/funil/FunnelVelocityTable.tsx` |
| `FunnelVisual` | `src/pages/analytics-new/funil/FunnelVisual.tsx` |
| `MultiPickerPopover` | `src/pages/analytics-new/funil/MultiPickerPopover.tsx` |
| `StageMultiSelect` | `src/pages/analytics-new/funil/StageMultiSelect.tsx` |
| `PipelineAgingHeatmap` | `src/pages/analytics-new/pipeline/PipelineAgingHeatmap.tsx` |
| `PipelineFilterPanel` | `src/pages/analytics-new/pipeline/PipelineFilterPanel.tsx` |
| `PipelineKpis` | `src/pages/analytics-new/pipeline/PipelineKpis.tsx` |
| `PipelineOwnerWorkload` | `src/pages/analytics-new/pipeline/PipelineOwnerWorkload.tsx` |
| `PipelineOwnersTable` | `src/pages/analytics-new/pipeline/PipelineOwnersTable.tsx` |
| `PipelineStagesChart` | `src/pages/analytics-new/pipeline/PipelineStagesChart.tsx` |
| `PipelineTasksSection` | `src/pages/analytics-new/pipeline/PipelineTasksSection.tsx` |
| `PipelineTopDeals` | `src/pages/analytics-new/pipeline/PipelineTopDeals.tsx` |
| `AnalyticsPage` | `src/pages/analytics/AnalyticsPage.tsx` |
| `ResumoView` | `src/pages/analytics/views/ResumoView.tsx` |
| `SaudeView` | `src/pages/analytics/views/SaudeView.tsx` |
| `DeveloperHub` | `src/pages/developer/DeveloperHub.tsx` |
| `HelpCenter` | `src/pages/help/HelpCenter.tsx` |
| `helpArticles` | `src/pages/help/helpArticles.tsx` |
| `DPA` | `src/pages/legal/DPA.tsx` |
| `Privacy` | `src/pages/legal/Privacy.tsx` |
| `Terms` | `src/pages/legal/Terms.tsx` |
| `MobileCardCreate` | `src/pages/mobile/MobileCardCreate.tsx` |
| `MobileContactPicker` | `src/pages/mobile/MobileContactPicker.tsx` |
| `AuditPage` | `src/pages/platform/AuditPage.tsx` |
| `DashboardPage` | `src/pages/platform/DashboardPage.tsx` |
| `GlobalCatalogsPage` | `src/pages/platform/GlobalCatalogsPage.tsx` |
| `LogsPage` | `src/pages/platform/LogsPage.tsx` |
| `OrganizationDetailPage` | `src/pages/platform/OrganizationDetailPage.tsx` |
| `OrganizationsPage` | `src/pages/platform/OrganizationsPage.tsx` |
| `PlatformLayout` | `src/pages/platform/PlatformLayout.tsx` |
| `SettingsPage` | `src/pages/platform/SettingsPage.tsx` |
| `UsersPage` | `src/pages/platform/UsersPage.tsx` |
| `ProposalConfirmed` | `src/pages/public/ProposalConfirmed.tsx` |
| `ProposalReview` | `src/pages/public/ProposalReview.tsx` |
| `ProposalView` | `src/pages/public/ProposalView.tsx` |
| `TripPlanView` | `src/pages/public/TripPlanView.tsx` |
| `TripPortalPublic` | `src/pages/public/TripPortalPublic.tsx` |

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

### PhaseSortPopover.tsx
- **Sort por fase:** Popover para configurar ordenação dentro de cada fase do Kanban

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

## 11. Componentes Principais (por Área)

| Área | Componentes-chave |
|------|-------------------|
| Layout | Header, Sidebar, Layout, ProductSwitcher, NotificationCenter |
| Pipeline | KanbanBoard, PipelineListView, CreateCardModal, FilterDrawer, DocumentBadge |
| Card | CardHeader, DynamicFieldRenderer, ActivityFeed, CardFiles, StageRequirements, FinanceiroWidget, CardTeamSection, DocumentCollectionWidget, BriefingIAModal, AudioRecorder, WeddingInformation, TagBadge, TagSelector |
| Propostas | ProposalBuilder, SectionEditor, AddItemMenu, VersionHistory |
| Admin | StudioUnified, IntegrationBuilder, KanbanCardSettings, JuliaIAConfig, TaskSyncTab |
| Health | IntegrationHealthTab, PulseGrid, ActiveAlertsList, HealthRulesConfig |
| Pessoas | PeopleGrid, PersonDetailDrawer, ContactForm, ContactImportModal, DuplicateWarningPanel, DataQualityBanner, DataQualityDrawer |
| Leads | LeadsTable, LeadsFilters, LeadsBulkActions |
| Trips | TripsTaxBadge, group/* (GroupDashboard, GroupTravelersList, CreateGroupModal, LinkToGroupModal) |
| Analytics | AnalyticsSidebar, GlobalControls, KpiCard, ChartCard, views/* (Overview, PipelineCurrent, Team, Funnel, SLA, WhatsApp, Operations, Financial, Retention) |
| Dashboard | StatsCards, FunnelChart, RecentActivity, TodayMeetingsWidget |
| Calendário | CalendarHeader, DayView, WeekView, MonthView, MeetingPopover |
| Relatórios | ReportsSidebar, ReportBuilder, ReportViewer, builder/* (SourceSelector, FieldPicker, ConfigPanel, FilterPanel, VizSelector), renderers/* (BarChart, LineChart, PieChart, Table, Kpi, Funnel), DashboardEditor, DashboardViewer |

## 12. Views Importantes

| View | Propósito |
|------|-----------|
| `view_dashboard_funil` | Métricas do funil (StatsCards, FunnelChart) |
| `view_cards_contatos_summary` | Cards com resumo de contatos |
| `view_cards_acoes` | Query principal do Kanban (usePipelineCards) |
| `v_proposal_analytics` | Performance de propostas |
| `view_profiles_complete` | Perfis com team/role |
| `view_contacts_full` | Lista completa de contatos (People) |
| `view_card_360` | Detalhes completos (CardDetail) |
| `view_integration_*` | Roteamento e auditoria de integrações |

## 13. Relacionamentos-Chave

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

## 14. Tabelas do Banco (Resumo por Função)

| Tabela | Papel | FK principais |
|--------|-------|---------------|
| **cards** | Central — deals/viagens | → pipeline_stages, contatos, cards (parent) |
| **contatos** | Central — pessoas | — |
| **profiles** | Central — usuários | → teams |
| proposals | Propostas comerciais | → cards |
| pipeline_stages | Stages do funil | → pipeline_phases, pipelines |
| pipeline_phases | Fases (SDR/Vendas/Pós) | → pipelines |
| activities | Log de atividades | → cards |
| tarefas | Tasks/tarefas | → cards |
| cards_contatos | N:N cards↔contatos | → cards, contatos |
| stage_field_config | Campos dinâmicos por stage | → pipeline_stages |
| card_team_members | Equipe do card | → cards, profiles |
| card_tags / card_tag_assignments | Tags M:N | → cards |
| custom_reports / custom_dashboards | Relatórios | → profiles |
| invitations | Convites com token 7 dias | → profiles, teams |

## 15. Campos IA no Cards (Agente WhatsApp)

| Coluna | Tipo | Propósito |
|--------|------|-----------|
| `ai_resumo` | TEXT | Resumo mantido pelo agente IA |
| `ai_contexto` | TEXT | Contexto cronológico da conversa |
| `ai_responsavel` | TEXT (default 'ia') | Quem responde: 'ia' ou 'humano' |

---

## 16. Mapa de Dependencias Criticas

### 16.1 Tabelas → Hooks → Paginas

| Tabela | Hooks que Usam | Paginas Afetadas |
|--------|----------------|------------------|
| `cards` | usePipelineCards, useCardContacts, useTrips, useSubCards | Pipeline, CardDetail, Dashboard, Trips |
| `contatos` | useContacts, useCardPeople | People, CardDetail |
| `pipeline_stages` | usePipelineStages, useQualityGate, useAllowedStages | Pipeline, CreateCardModal, CardHeader |
| `proposals` | useProposals, useProposalBuilder | ProposalBuilderV4, CardDetail |
| `tarefas` | useTasks, useCardTasks | CardDetail, Tasks |
| `system_fields` | useFieldConfig, useStageRequiredFields | CardDetail (todas as sections) |

### 16.2 Views Criticas

| View | Usado Por | Se Modificar... |
|------|-----------|-----------------|
| `view_cards_acoes` | usePipelineCards, Pipeline | Impacta TODO o Kanban |
| `view_contacts_full` | useContacts | Impacta lista de Pessoas |
| `view_card_360` | CardDetail | Impacta pagina de detalhes |

### 16.3 Componentes Core

| Componente | Usado Em | Impacto |
|------------|----------|---------|
| `KanbanBoard` | Pipeline | Todo o fluxo de cards |
| `CardHeader` | CardDetail | Titulo, fase, owner |
| `SectionRenderer` | CardDetail | Todas as secoes dinamicas |
| `CreateCardModal` | Pipeline, Dashboard | Criacao de novos cards |

### 16.4 Pickers Reutilizaveis (ai-agent/editor)

| Componente | Arquivo | Uso |
|------------|---------|-----|
| `CRMFieldPicker` | `src/components/ai-agent/editor/CRMFieldPicker.tsx` | Selecao de campos do CRM (single/multi) com busca e agrupamento |
| `SearchPicker` | `src/components/ai-agent/editor/pickers.tsx` | Base generica single-select com busca |
| `TagPicker` | `src/components/ai-agent/editor/pickers.tsx` | Selecao de tag existente com criacao inline |
| `AgentPicker` | `src/components/ai-agent/editor/pickers.tsx` | Selecao de outro agente IA da org |
| `StagePicker` | `src/components/ai-agent/editor/pickers.tsx` | Selecao de etapa do pipeline |












