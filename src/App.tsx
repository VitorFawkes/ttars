import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { OrgProvider } from './contexts/OrgContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Terms from './pages/legal/Terms'
import Privacy from './pages/legal/Privacy'
import DPA from './pages/legal/DPA'
import InvitePage from './pages/InvitePage'
import Pipeline from './pages/Pipeline'
import CardDetail from './pages/CardDetail'
import CardViagem from './pages/CardViagem'
import ViagemStandalone from './pages/ViagemStandalone'
import ViagensPage from './pages/ViagensPage'
import CardByConversation from './pages/CardByConversation'
import CreateCardFromEcho from './pages/CreateCardFromEcho'
import Cards from './pages/Cards'
import Leads from './pages/Leads'
import People from './pages/People'
import Empresas from './pages/Empresas'
import GroupsPage from './pages/GroupsPage'
import ProposalBuilderElite from './pages/ProposalBuilderElite'
import BuilderPageV5 from './components/proposals/v5/BuilderPage'
import PortalEditor from './pages/PortalEditor'
import ProposalsPage from './pages/ProposalsPage'
import CatalogoPage from './pages/CatalogoPage'
import AnalyticsWeddingsPage from './pages/AnalyticsWeddings/AnalyticsWeddingsPage'
import ProposalView from './pages/public/ProposalView'
import TripPortalPublic from './pages/public/TripPortalPublic'
import AnalyticsPage from './pages/analytics/AnalyticsPage'
import LegacySaudeView from './pages/analytics/views/SaudeView'
import LegacyResumoView from './pages/analytics/views/ResumoView'
import PipelineCurrentView from './components/analytics/views/PipelineCurrentView'
import LegacyWhatsAppView from './components/analytics/views/WhatsAppView'
import SalesFunnelView from './components/analytics/views/SalesFunnelView'
import TeamAnalyticsView from './components/analytics/views/TeamAnalyticsView'
import LegacyOperationsView from './components/analytics/views/OperationsView'
import AnalyticsLayout from './pages/analytics-new/AnalyticsLayout'
import AnalyticsRootRedirect from './pages/analytics-new/AnalyticsRootRedirect'
import PipelineView from './pages/analytics-new/PipelineView'
import FunnelView from './pages/analytics-new/FunnelView'
import ResumoView from './pages/analytics-new/ResumoView'
import SaudeView from './pages/analytics-new/SaudeView'
import WhatsAppView from './pages/analytics-new/WhatsAppView'
import TeamView from './pages/analytics-new/TeamView'
import SdrView from './pages/analytics-new/SdrView'
import PlannerView from './pages/analytics-new/PlannerView'
import FinancialView from './pages/analytics-new/FinancialView'
import RetentionView from './pages/analytics-new/RetentionView'
import OperationsView from './pages/analytics-new/OperationsView'
import ConciergeView from './pages/analytics-new/ConciergeView'
import SLAView from './pages/analytics-new/SLAView'
import ExplorarPage from './pages/analytics-new/ExplorarPage'
import CalendarPage from './pages/CalendarPage'
import Tasks from './pages/Tasks'
import NPSPage from './pages/NPSPage'
import ReactivationPage from './pages/ReactivationPage'
import PontuacoesPage from './pages/sdr/PontuacoesPage'
import ConvidadosLayout from './pages/convidados/ConvidadosLayout'
import ConvidadosPage from './pages/convidados/ConvidadosPage'
import CasamentoDetailPage from './pages/convidados/CasamentoDetailPage'
import ConfiguracaoFluxoPage from './pages/convidados/ConfiguracaoFluxoPage'
import CalendarioPage from './pages/convidados/CalendarioPage'
import ConciergeLayout from './pages/concierge/ConciergeLayout'
import KanbanPage from './pages/concierge/KanbanPage'
import PainelGestorPage from './pages/concierge/PainelGestorPage'
import ModelosPage from './pages/concierge/ModelosPage'

import ProposalReview from './pages/public/ProposalReview'
import ProposalConfirmed from './pages/public/ProposalConfirmed'

import SettingsPage from './pages/SettingsPage'
import ProfileSettings from './components/settings/profile/ProfileSettings'

import StudioUnified from './components/admin/studio/StudioUnified'
import SectionManager from './components/admin/studio/SectionManager'
// FieldManager removed - replaced by StudioUnified
import PipelineStudio from './pages/admin/PipelineStudio'
import PlatformLayout from './pages/platform/PlatformLayout'
import PlatformDashboard from './pages/platform/DashboardPage'
import PlatformOrganizations from './pages/platform/OrganizationsPage'
import PlatformOrganizationDetail from './pages/platform/OrganizationDetailPage'
import PlatformUsers from './pages/platform/UsersPage'
import PlatformAudit from './pages/platform/AuditPage'
import PlatformSettings from './pages/platform/SettingsPage'
import PlatformLogs from './pages/platform/LogsPage'
import PlatformCatalogs from './pages/platform/GlobalCatalogsPage'
import ProductsManagement from './pages/admin/ProductsManagement'
import WorkspaceGeneral from './pages/admin/WorkspaceGeneral'
import DepartmentsManagement from './pages/admin/DepartmentsManagement'
import CardAlertRulesPage from './pages/admin/CardAlertRulesPage'
import HelpCenter from './pages/help/HelpCenter'
import UserManagement from './pages/admin/UserManagement'
import CategoryManagement from './pages/admin/CategoryManagement'
import LossReasonManagement from './pages/admin/LossReasonManagement'
import CancellationReasonManagement from './pages/admin/CancellationReasonManagement'
import LeadSourcesManagement from './pages/admin/LeadSourcesManagement'
import TagManagement from './pages/admin/TagManagement'
import PhaseVisibilitySettings from './pages/admin/PhaseVisibilitySettings'
import CRMHealth from './pages/admin/CRMHealth'
import ScheduledJobsPage from './pages/admin/ScheduledJobsPage'
import ScheduledJobDetailPage from './pages/admin/ScheduledJobDetailPage'
import CardCreationRulesPage from './pages/admin/CardCreationRulesPage'
import Lixeira from './pages/admin/Lixeira'
import Arquivados from './pages/admin/Arquivados'
import VendasMondePage from './pages/admin/VendasMondePage'
import ImportacaoPosVendaPage from './pages/admin/ImportacaoPosVendaPage'
import PresentesHubPage from './pages/PresentesHubPage'
import { IntegrationsPage } from './components/admin/integrations/IntegrationsPage'
import DeveloperHub from './pages/developer/DeveloperHub'
import { WhatsAppPage } from './components/admin/whatsapp/WhatsAppPage'
import KanbanCardSettings from './components/admin/KanbanCardSettings'
import ActionRequirementsTab from './components/admin/studio/ActionRequirementsTab'
import NotificationConfigPage from './components/settings/customization/NotificationConfigPage'
// Automações unificadas (hub novo)
import AutomationsListPage from './pages/admin/automations/AutomationsListPage'
import NewAutomationPage from './pages/admin/automations/NewAutomationPage'
import AutomationBuilderPage from './pages/admin/automations/AutomationBuilderPage'
import CronRoteamentoDetailPage from './pages/admin/automations/CronRoteamentoDetailPage'
// Cadence Engine builders (acessados via /settings/automations, list page foi unificada na Fase 2)
import CadenceBuilderPage from './pages/admin/cadence/CadenceBuilderPage'
import AutomacaoBuilderPage from './pages/admin/cadence/AutomacaoBuilderPage'
import CadenceMonitorPage from './pages/admin/cadence/CadenceMonitorPage'
// Workflow Editor v2 (estilo n8n, canvas com nodes)
import WorkflowEditorPage from './pages/admin/automations/v2/WorkflowEditorPage'
// Templates de Mensagem (biblioteca unificada usada por automações)
import MensagemTemplatePage from './pages/admin/MensagemTemplatePage'
// Agentes IA WhatsApp
import AiAgentListPage from './pages/admin/AiAgentListPage'
import AiAgentDetailPage from './pages/admin/AiAgentDetailPage'
import AiAgentV2ListPage from './pages/admin/AiAgentV2ListPage'
import AiAgentV2DetailPage from './pages/admin/AiAgentV2DetailPage'
import AiSkillManagerPage from './pages/admin/AiSkillManagerPage'
import AiKnowledgeBasePage from './pages/admin/AiKnowledgeBasePage'
import AiAgentConversationsPage from './pages/admin/AiAgentConversationsPage'
import AiAgentAnalyticsPage from './pages/admin/AiAgentAnalyticsPage'
import AiAgentHealthPage from './pages/admin/AiAgentHealthPage'
import AiAgentBuilderWizard from './pages/admin/AiAgentBuilderWizard'
import OutboundQueuePage from './pages/admin/OutboundQueuePage'
import { lazy, Suspense } from 'react'
const MobileCardCreate = lazy(() => import('./pages/mobile/MobileCardCreate'))
const PatriciaProtoPage = lazy(() => import('./pages/_proto/patricia/PatriciaProtoPage'))
import { ToastProvider } from './contexts/ToastContext'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { Toaster, toast } from 'sonner'
import { SupabaseOutageBanner } from './components/shared/SupabaseOutageBanner'
import { reportSupabaseNetworkError } from './lib/supabaseHealth'

function isNetworkError(error: Error): boolean {
    const msg = error.message?.toLowerCase() ?? ''
    return (
        !navigator.onLine ||
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('load failed') ||
        msg.includes('network request failed') ||
        error.name === 'TypeError' && msg.includes('fetch')
    )
}

const queryClient = new QueryClient({
    queryCache: new QueryCache({
        onError: (error) => {
            console.error('[QueryCache] Query error:', error.message)
            if (error.message?.includes('42703')) {
                toast.error('Erro ao carregar dados', {
                    description: 'Atualização do sistema em andamento. Tente novamente em alguns minutos.',
                    id: 'query-error-schema',
                })
            } else if (isNetworkError(error)) {
                reportSupabaseNetworkError()
                toast.error('Erro de conexão', {
                    description: 'Verifique sua conexão com a internet e tente novamente.',
                    id: 'query-error-network',
                })
            }
            // Outros erros: apenas log no console, sem toast global
            // (componentes tratam seus próprios erros via onError/isError)
        },
    }),
    mutationCache: new MutationCache({
        onError: (error) => {
            console.error('[MutationCache] Mutation error:', error.message)
            if (error instanceof Error && isNetworkError(error)) {
                reportSupabaseNetworkError()
            }
        },
    }),
    defaultOptions: {
        queries: {
            retry: 3,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
            staleTime: 1000 * 60 * 2,   // 2 minutos
            gcTime: 1000 * 60 * 30,      // 30 minutos
            refetchOnWindowFocus: true,
        },
        mutations: {
            retry: 1,
        },
    },
})

function DefaultRedirect() {
    const lastRoute = localStorage.getItem('welcomecrm-last-route')
    const target = lastRoute && lastRoute !== '/' && lastRoute !== '/dashboard' ? lastRoute : '/pipeline'
    return <Navigate to={target} replace />
}

// Redirects legacy /settings/cadence/* → /settings/automations/* (Fase 2)
function RedirectToAutomacao() {
    const { id } = useParams()
    return <Navigate to={`/settings/automations/automacao/${id}`} replace />
}
function RedirectToCadenceBuilder() {
    const { id } = useParams()
    return <Navigate to={`/settings/automations/${id}`} replace />
}
function RedirectToCadenceMonitor() {
    const { id } = useParams()
    return <Navigate to={`/settings/automations/${id}/monitor`} replace />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AuthProvider>
          <OrgProvider>
          <ToastProvider>
            <SupabaseOutageBanner />
            <Toaster richColors position="top-right" />
            <BrowserRouter>
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/legal/terms" element={<Terms />} />
                <Route path="/legal/privacy" element={<Privacy />} />
                <Route path="/legal/dpa" element={<DPA />} />
                <Route path="/invite/:token" element={<InvitePage />} />
                <Route path="/p/:token" element={<ProposalView />} />
                <Route path="/v/:token" element={<TripPortalPublic />} />
                <Route path="/p/:token/review" element={<ProposalReview />} />
                <Route path="/p/:token/confirmed" element={<ProposalConfirmed />} />

                {/* Mobile Routes (authenticated, no sidebar) */}
                <Route path="/m/novo-card" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}><MobileCardCreate /></Suspense>} />

                {/* Prototype Routes — TEMPORÁRIO. Remover quando o redesign for aplicado em src/pages/admin/AiAgentV2DetailPage.tsx. */}
                <Route path="/proto/patricia" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}><PatriciaProtoPage /></Suspense>} />

                {/* Protected Routes */}
                <Route element={<Layout />}>
                  <Route path="/" element={<DefaultRedirect />} />
                  <Route path="/dashboard" element={<Navigate to="/pipeline" replace />} />
                  <Route path="/pipeline" element={<Pipeline />} />
                  <Route path="/leads" element={<Leads />} />
                  <Route path="/groups" element={<GroupsPage />} />
                  <Route path="/trips" element={<Cards />} />
                  <Route path="/cards" element={<Navigate to="/trips" replace />} />
                  <Route path="/cards/convo/:conversationId" element={<CardByConversation />} />
                  <Route path="/cards/echo/criar/:conversationId" element={<CreateCardFromEcho />} />
                  <Route path="/cards/:id" element={<CardDetail />} />
                  <Route path="/cards/:id/viagem" element={<CardViagem />} />
                  <Route path="/viagens" element={<ViagensPage />} />
                  <Route path="/viagens/:id" element={<ViagemStandalone />} />
                  <Route path="/vendas-monde" element={<VendasMondePage />} />
                  <Route path="/importacao-pos-venda" element={<ImportacaoPosVendaPage />} />
                  <Route path="/importacao-pos-venda/:logId" element={<ImportacaoPosVendaPage />} />
                  <Route path="/presentes" element={<PresentesHubPage />} />
                  <Route path="/people" element={<People />} />
                  <Route path="/empresas" element={<Empresas />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/proposals" element={<ProposalsPage />} />
                  <Route path="/catalogo" element={<CatalogoPage />} />
                  <Route path="/reactivation" element={<ReactivationPage />} />
                  <Route path="/nps" element={<NPSPage />} />
                  <Route path="/sdr/pontuacoes" element={<PontuacoesPage />} />
                  <Route path="/convidados" element={<ConvidadosLayout />}>
                    <Route index element={<ConvidadosPage />} />
                    <Route path="casamento/:id" element={<CasamentoDetailPage />} />
                    <Route path="fluxo" element={<ConfiguracaoFluxoPage />} />
                    <Route path="calendario" element={<CalendarioPage />} />
                  </Route>
                  <Route path="/concierge" element={<ConciergeLayout />}>
                    <Route index element={<KanbanPage />} />
                    <Route path="meu-dia" element={<Navigate to="/concierge" replace />} />
                    <Route path="kanban" element={<Navigate to="/concierge" replace />} />
                    <Route path="em-lote" element={<Navigate to="/concierge" replace />} />
                    <Route path="painel" element={<PainelGestorPage />} />
                    <Route path="modelos" element={<ModelosPage />} />
                  </Route>
                  {/* Analytics — reconstrução em fases (plan: analytics-rebuild.md). Fase 0 = esqueleto + Explorar portado */}
                  <Route path="/analytics" element={<AnalyticsLayout />}>
                    <Route index element={<AnalyticsRootRedirect />} />
                    <Route path="pipeline" element={<PipelineView />} />
                    <Route path="funil" element={<FunnelView />} />
                    <Route path="resumo" element={<ResumoView />} />
                    <Route path="saude" element={<SaudeView />} />
                    <Route path="whatsapp" element={<WhatsAppView />} />
                    <Route path="equipe" element={<TeamView />} />
                    <Route path="sdr" element={<SdrView />} />
                    <Route path="planner" element={<PlannerView />} />
                    <Route path="financeiro" element={<FinancialView />} />
                    <Route path="retencao" element={<RetentionView />} />
                    <Route path="operacoes" element={<OperationsView />} />
                    <Route path="concierge" element={<ConciergeView />} />
                    <Route path="sla" element={<SLAView />} />
                    <Route path="explorar" element={<ExplorarPage />} />
                  </Route>
                  {/* Legado — safety net até o cleanup da Fase 5 */}
                  <Route path="/analytics/legacy" element={<AnalyticsPage />}>
                    <Route index element={<Navigate to="/analytics/legacy/saude" replace />} />
                    <Route path="saude" element={<LegacySaudeView />} />
                    <Route path="resumo" element={<LegacyResumoView />} />
                    <Route path="pipeline" element={<PipelineCurrentView />} />
                    <Route path="whatsapp" element={<LegacyWhatsAppView />} />
                    <Route path="funnel" element={<SalesFunnelView />} />
                    <Route path="team" element={<TeamAnalyticsView />} />
                    <Route path="operations" element={<LegacyOperationsView />} />
                    <Route path="completeness" element={<Navigate to="/leads?view=preenchimento" replace />} />
                  </Route>
                  {/* Redirects de rotas persona V2 para a raiz nova */}
                  <Route path="/analytics/dono" element={<Navigate to="/analytics" replace />} />
                  <Route path="/analytics/comercial" element={<Navigate to="/analytics" replace />} />
                  <Route path="/analytics/vendas" element={<Navigate to="/analytics/planner" replace />} />
                  <Route path="/analytics/pos-venda" element={<Navigate to="/analytics/operacoes" replace />} />
                  <Route path="/analytics/sdr" element={<Navigate to="/analytics/whatsapp" replace />} />
                  <Route path="/analytics/v2/*" element={<Navigate to="/analytics" replace />} />
                  <Route path="/analytics-weddings" element={<AnalyticsWeddingsPage />} />
                  <Route path="/proposals/:id/edit" element={<BuilderPageV5 />} />
                  <Route path="/portal-editor/:proposalId" element={<PortalEditor />} />
                  <Route path="/portal-editor/card/:cardId" element={<PortalEditor />} />
                  <Route path="/proposals/:id/legacy" element={<ProposalBuilderElite />} />

                  {/* Help Center */}
                  <Route path="/help" element={<HelpCenter />} />

                  {/* Super-Admin movido para /platform — redireciona legado */}
                  <Route path="/admin/organizations" element={<Navigate to="/platform/organizations" replace />} />

                  {/* Redirects legacy: /admin/automations e /admin/cadence movidos para /settings/automations */}
                  <Route path="/admin/automations" element={<Navigate to="/settings/automations" replace />} />
                  <Route path="/admin/automations/monitor" element={<Navigate to="/settings/automations?tab=monitor" replace />} />
                  <Route path="/admin/automations/new" element={<Navigate to="/settings/automations/new" replace />} />
                  <Route path="/admin/automations/:id" element={<Navigate to="/settings/automations" replace />} />
                  <Route path="/admin/cadence" element={<Navigate to="/settings/automations" replace />} />
                  <Route path="/admin/cadence/automacao/new" element={<Navigate to="/settings/automations/automacao/new" replace />} />
                  <Route path="/admin/cadence/automacao/:id" element={<Navigate to="/settings/automations" replace />} />
                  <Route path="/admin/cadence/new" element={<Navigate to="/settings/automations" replace />} />
                  <Route path="/admin/cadence/:id" element={<Navigate to="/settings/automations" replace />} />
                  <Route path="/admin/cadence/:id/monitor" element={<Navigate to="/settings/automations" replace />} />

                  <Route path="/admin" element={<Navigate to="/settings/system/governance" replace />} />

                  {/* Settings Routes */}
                  <Route path="/settings" element={<SettingsPage />}>
                    <Route index element={<Navigate to="/settings/profile" replace />} />
                    <Route path="profile" element={<ProfileSettings />} />

                    {/* Workspace Settings */}
                    <Route path="workspace/general" element={<WorkspaceGeneral />} />
                    <Route path="workspace/products" element={<ProductsManagement />} />
                    <Route path="workspace/whatsapp" element={<WhatsAppPage />} />

                    {/* ═══════════════════════════════════════════════════════════
                        CUSTOMIZATION: Data Rules & Requirements
                    ═══════════════════════════════════════════════════════════ */}
                    {/* FieldManager replaced by StudioUnified (data-rules) */}
                    <Route path="customization/fields" element={<Navigate to="/settings/customization/data-rules" replace />} />

                    <Route path="customization/sections" element={<SectionManager />} />
                    <Route path="customization/data-rules" element={<StudioUnified />} />
                    <Route path="customization/action-requirements" element={<ActionRequirementsTab />} />

                    {/* Automações — hub unificado (Fase 2 + 3) */}
                    <Route path="automations" element={<AutomationsListPage />} />
                    <Route path="automations/new" element={<NewAutomationPage />} />
                    <Route path="automations/automacao/new" element={<AutomacaoBuilderPage />} />
                    <Route path="automations/automacao/:id" element={<AutomacaoBuilderPage />} />
                    <Route path="automations/cadence/new" element={<CadenceBuilderPage />} />
                    {/* Workflow Editor v2 (canvas estilo n8n) — beta */}
                    <Route path="automations/v2/new" element={<WorkflowEditorPage />} />
                    <Route path="automations/v2/:id" element={<WorkflowEditorPage />} />
                    <Route path="automations/trigger/new" element={<AutomationBuilderPage />} />
                    <Route path="automations/trigger/:id" element={<AutomationBuilderPage />} />
                    <Route path="automations/roteamento/:id" element={<CronRoteamentoDetailPage />} />
                    <Route path="automations/:id" element={<CadenceBuilderPage />} />
                    <Route path="automations/:id/monitor" element={<CadenceMonitorPage />} />

                    <Route path="customization/notifications" element={<NotificationConfigPage />} />
                    <Route path="customization/alert-rules" element={<CardAlertRulesPage />} />
                    <Route path="customization/categories" element={<CategoryManagement />} />
                    <Route path="customization/loss-reasons" element={<LossReasonManagement />} />
                    <Route path="customization/cancellation-reasons" element={<CancellationReasonManagement />} />
                    <Route path="customization/lead-sources" element={<LeadSourcesManagement />} />
                    <Route path="customization/tags" element={<TagManagement />} />

                    {/* Templates de Mensagem (consumidos por automações) */}
                    <Route path="automacoes/templates" element={<MensagemTemplatePage />} />

                    {/* Agentes IA WhatsApp */}
                    <Route path="ai-agents" element={<AiAgentListPage />} />
                    <Route path="ai-agents/builder" element={<AiAgentBuilderWizard />} />
                    <Route path="ai-agents/builder/:draftId" element={<AiAgentBuilderWizard />} />
                    <Route path="ai-agents/:id" element={<AiAgentDetailPage />} />
                    {/* Agentes IA v2 (single-agent + brand validator — Patricia) */}
                    <Route path="ai-agents-v2" element={<AiAgentV2ListPage />} />
                    <Route path="ai-agents-v2/:id" element={<AiAgentV2DetailPage />} />
                    <Route path="ai-skills" element={<AiSkillManagerPage />} />
                    <Route path="ai-knowledge-bases" element={<AiKnowledgeBasePage />} />
                    <Route path="ai-agents/conversations" element={<AiAgentConversationsPage />} />
                    <Route path="ai-agents/analytics" element={<AiAgentAnalyticsPage />} />
                    <Route path="ai-agents/health" element={<AiAgentHealthPage />} />
                    <Route path="ai-agents/outbound-queue" element={<OutboundQueuePage />} />

                    {/* Redirects legacy /settings/cadence → /settings/automations (Fase 2) */}
                    <Route path="cadence" element={<Navigate to="/settings/automations" replace />} />
                    <Route path="cadence/automacao/new" element={<Navigate to="/settings/automations/automacao/new" replace />} />
                    <Route path="cadence/automacao/:id" element={<RedirectToAutomacao />} />
                    <Route path="cadence/new" element={<Navigate to="/settings/automations/new" replace />} />
                    <Route path="cadence/:id" element={<RedirectToCadenceBuilder />} />
                    <Route path="cadence/:id/monitor" element={<RedirectToCadenceMonitor />} />

                    {/* ═══════════════════════════════════════════════════════════
                        PIPELINE: Funnel Structure
                    ═══════════════════════════════════════════════════════════ */}
                    <Route path="pipeline/structure" element={<PipelineStudio />} />
                    <Route path="pipeline/card-display" element={<KanbanCardSettings />} />

                    {/* ═══════════════════════════════════════════════════════════
                        INTEGRATIONS: External Connections
                    ═══════════════════════════════════════════════════════════ */}
                    <Route path="integrations" element={<IntegrationsPage />} />
                    <Route path="developer-platform" element={<DeveloperHub />} />

                    {/* ═══════════════════════════════════════════════════════════
                        TEAM: Users, Roles, Teams
                    ═══════════════════════════════════════════════════════════ */}
                    <Route path="team/members" element={<UserManagement />} />
                    <Route path="team/departments" element={<DepartmentsManagement />} />
                    <Route path="team/phase-visibility" element={<PhaseVisibilitySettings />} />
                    <Route path="team/card-rules" element={<CardCreationRulesPage />} />

                    {/* ═══════════════════════════════════════════════════════════
                        OPERATIONS: Maintenance & Health
                    ═══════════════════════════════════════════════════════════ */}
                    <Route path="operations/vendas-monde" element={<Navigate to="/vendas-monde" replace />} />
                    <Route path="operations/health" element={<CRMHealth />} />
                    <Route path="operations/scheduled-jobs" element={<ScheduledJobsPage />} />
                    <Route path="operations/scheduled-jobs/:jobName" element={<ScheduledJobDetailPage />} />
                    <Route path="operations/trash" element={<Lixeira />} />
                    <Route path="operations/archive" element={<Arquivados />} />

                    {/* ═══════════════════════════════════════════════════════════
                        BACKWARDS COMPATIBILITY REDIRECTS
                        Old URLs → New URLs (Remove after 30 days)
                    ═══════════════════════════════════════════════════════════ */}
                    <Route path="system/fields" element={<Navigate to="/settings/customization/fields" replace />} />
                    <Route path="system/governance" element={<Navigate to="/settings/customization/data-rules" replace />} />
                    <Route path="system/pipeline" element={<Navigate to="/settings/pipeline/structure" replace />} />
                    <Route path="system/kanban-cards" element={<Navigate to="/settings/pipeline/card-display" replace />} />
                    <Route path="system/categories" element={<Navigate to="/settings/customization/categories" replace />} />
                    <Route path="system/integrations" element={<Navigate to="/settings/integrations" replace />} />
                    <Route path="system/whatsapp" element={<Navigate to="/settings/workspace/whatsapp" replace />} />
                    <Route path="system/users" element={<Navigate to="/settings/team/members" replace />} />
                    <Route path="system/health" element={<Navigate to="/settings/operations/health" replace />} />
                    <Route path="system/trash" element={<Navigate to="/settings/operations/trash" replace />} />
                    <Route path="workspace/members" element={<Navigate to="/settings/team/members" replace />} />
                  </Route>
                </Route>

                {/* ═══════════════════════════════════════════════════════════
                    Platform Admin Console (dono do SaaS — fora do contexto de org)
                ═══════════════════════════════════════════════════════════ */}
                <Route path="/platform" element={<PlatformLayout />}>
                  <Route index element={<PlatformDashboard />} />
                  <Route path="organizations" element={<PlatformOrganizations />} />
                  <Route path="organizations/:id" element={<PlatformOrganizationDetail />} />
                  <Route path="users" element={<PlatformUsers />} />
                  <Route path="logs" element={<PlatformLogs />} />
                  <Route path="catalogs" element={<PlatformCatalogs />} />
                  <Route path="audit" element={<PlatformAudit />} />
                  <Route path="settings" element={<PlatformSettings />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ToastProvider>
          </OrgProvider>
        </AuthProvider>
      </ErrorBoundary>
    </QueryClientProvider >
  )
}

export default App
