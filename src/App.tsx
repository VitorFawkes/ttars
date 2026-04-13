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
import Dashboard from './pages/Dashboard'
import InvitePage from './pages/InvitePage'
import Pipeline from './pages/Pipeline'
import CardDetail from './pages/CardDetail'
import CardByConversation from './pages/CardByConversation'
import CreateCardFromEcho from './pages/CreateCardFromEcho'
import Cards from './pages/Cards'
import Leads from './pages/Leads'
import People from './pages/People'
import GroupsPage from './pages/GroupsPage'
import ProposalBuilderElite from './pages/ProposalBuilderElite'
import BuilderPageV5 from './components/proposals/v5/BuilderPage'
import PortalEditor from './pages/PortalEditor'
import ProposalsPage from './pages/ProposalsPage'
import ProposalView from './pages/public/ProposalView'
import TripPortalPublic from './pages/public/TripPortalPublic'
import AnalyticsPage from './pages/analytics/AnalyticsPage'
import PipelineCurrentView from './components/analytics/views/PipelineCurrentView'
import WhatsAppView from './components/analytics/views/WhatsAppView'
import SalesFunnelView from './components/analytics/views/SalesFunnelView'
import TeamAnalyticsView from './components/analytics/views/TeamAnalyticsView'
import OperationsView from './components/analytics/views/OperationsView'
import MondePreviewPage from './pages/MondePreviewPage'
import CalendarPage from './pages/CalendarPage'
import Tasks from './pages/Tasks'
import ReactivationPage from './pages/ReactivationPage'


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
import ProductsManagement from './pages/admin/ProductsManagement'
import WorkspaceGeneral from './pages/admin/WorkspaceGeneral'
import DepartmentsManagement from './pages/admin/DepartmentsManagement'
import CardAlertRulesPage from './pages/admin/CardAlertRulesPage'
import HelpCenter from './pages/help/HelpCenter'
import UserManagement from './pages/admin/UserManagement'
import CategoryManagement from './pages/admin/CategoryManagement'
import LossReasonManagement from './pages/admin/LossReasonManagement'
import TagManagement from './pages/admin/TagManagement'
import PhaseVisibilitySettings from './pages/admin/PhaseVisibilitySettings'
import CRMHealth from './pages/admin/CRMHealth'
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
// Cadence Engine builders (acessados via /settings/automations, list page foi unificada na Fase 2)
import CadenceBuilderPage from './pages/admin/cadence/CadenceBuilderPage'
import AutomacaoBuilderPage from './pages/admin/cadence/AutomacaoBuilderPage'
import CadenceMonitorPage from './pages/admin/cadence/CadenceMonitorPage'
// Templates de Mensagem (biblioteca unificada usada por automações)
import MensagemTemplatePage from './pages/admin/MensagemTemplatePage'
// Agentes IA WhatsApp
import AiAgentListPage from './pages/admin/AiAgentListPage'
import AiAgentDetailPage from './pages/admin/AiAgentDetailPage'
import AiSkillManagerPage from './pages/admin/AiSkillManagerPage'
import AiKnowledgeBasePage from './pages/admin/AiKnowledgeBasePage'
import AiAgentConversationsPage from './pages/admin/AiAgentConversationsPage'
import AiAgentAnalyticsPage from './pages/admin/AiAgentAnalyticsPage'
import AiAgentBuilderWizard from './pages/admin/AiAgentBuilderWizard'
import { lazy, Suspense } from 'react'
const MobileCardCreate = lazy(() => import('./pages/mobile/MobileCardCreate'))
import { ToastProvider } from './contexts/ToastContext'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { Toaster, toast } from 'sonner'

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
    const target = lastRoute && lastRoute !== '/' ? lastRoute : '/dashboard'
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

                {/* Protected Routes */}
                <Route element={<Layout />}>
                  <Route path="/" element={<DefaultRedirect />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/pipeline" element={<Pipeline />} />
                  <Route path="/leads" element={<Leads />} />
                  <Route path="/groups" element={<GroupsPage />} />
                  <Route path="/trips" element={<Cards />} />
                  <Route path="/cards" element={<Navigate to="/trips" replace />} />
                  <Route path="/cards/convo/:conversationId" element={<CardByConversation />} />
                  <Route path="/cards/echo/criar/:conversationId" element={<CreateCardFromEcho />} />
                  <Route path="/cards/:id" element={<CardDetail />} />
                  <Route path="/cards/:id/monde-preview" element={<MondePreviewPage />} />
                  <Route path="/vendas-monde" element={<VendasMondePage />} />
                  <Route path="/importacao-pos-venda" element={<ImportacaoPosVendaPage />} />
                  <Route path="/presentes" element={<PresentesHubPage />} />
                  <Route path="/people" element={<People />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/proposals" element={<ProposalsPage />} />
                  <Route path="/reactivation" element={<ReactivationPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />}>
                    <Route index element={<Navigate to="/analytics/pipeline" replace />} />
                    <Route path="pipeline" element={<PipelineCurrentView />} />
                    <Route path="whatsapp" element={<WhatsAppView />} />
                    <Route path="funnel" element={<SalesFunnelView />} />
                    <Route path="team" element={<TeamAnalyticsView />} />
                    <Route path="operations" element={<OperationsView />} />
                  </Route>
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
                    <Route path="automations/:id" element={<CadenceBuilderPage />} />
                    <Route path="automations/:id/monitor" element={<CadenceMonitorPage />} />

                    <Route path="customization/notifications" element={<NotificationConfigPage />} />
                    <Route path="customization/alert-rules" element={<CardAlertRulesPage />} />
                    <Route path="customization/categories" element={<CategoryManagement />} />
                    <Route path="customization/loss-reasons" element={<LossReasonManagement />} />
                    <Route path="customization/tags" element={<TagManagement />} />

                    {/* Templates de Mensagem (consumidos por automações) */}
                    <Route path="automacoes/templates" element={<MensagemTemplatePage />} />

                    {/* Agentes IA WhatsApp */}
                    <Route path="ai-agents" element={<AiAgentListPage />} />
                    <Route path="ai-agents/builder" element={<AiAgentBuilderWizard />} />
                    <Route path="ai-agents/builder/:draftId" element={<AiAgentBuilderWizard />} />
                    <Route path="ai-agents/new" element={<AiAgentDetailPage />} />
                    <Route path="ai-agents/:id" element={<AiAgentDetailPage />} />
                    <Route path="ai-skills" element={<AiSkillManagerPage />} />
                    <Route path="ai-knowledge-bases" element={<AiKnowledgeBasePage />} />
                    <Route path="ai-agents/conversations" element={<AiAgentConversationsPage />} />
                    <Route path="ai-agents/analytics" element={<AiAgentAnalyticsPage />} />

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
