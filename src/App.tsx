import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import InvitePage from './pages/InvitePage'
import Pipeline from './pages/Pipeline'
import CardDetail from './pages/CardDetail'
import Cards from './pages/Cards'
import Leads from './pages/Leads'
import People from './pages/People'
import GroupsPage from './pages/GroupsPage'
import ProposalBuilderElite from './pages/ProposalBuilderElite'
import ProposalBuilderV4 from './pages/ProposalBuilderV4'
import ProposalsPage from './pages/ProposalsPage'
import ProposalView from './pages/public/ProposalView'
import AnalyticsPage from './pages/analytics/AnalyticsPage'
import ReportsPage from './pages/reports/ReportsPage'
import ReportsList from './components/reports/ReportsList'
import ReportBuilder from './components/reports/ReportBuilder'
import ReportViewer from './components/reports/ReportViewer'
import DashboardsList from './components/reports/DashboardsList'
import DashboardEditor from './components/reports/DashboardEditor'
import DashboardViewer from './components/reports/DashboardViewer'
import OverviewView from './components/analytics/views/OverviewView'
import TeamView from './components/analytics/views/TeamView'
import FunnelView from './components/analytics/views/FunnelView'
import SLAView from './components/analytics/views/SLAView'
import WhatsAppView from './components/analytics/views/WhatsAppView'
import OperationsView from './components/analytics/views/OperationsView'
import FinancialView from './components/analytics/views/FinancialView'
import RetentionView from './components/analytics/views/RetentionView'
import MondePreviewPage from './pages/MondePreviewPage'
import CalendarPage from './pages/CalendarPage'


import ProposalReview from './pages/public/ProposalReview'
import ProposalConfirmed from './pages/public/ProposalConfirmed'

import SettingsPage from './pages/SettingsPage'
import ProfileSettings from './components/settings/profile/ProfileSettings'

import StudioUnified from './components/admin/studio/StudioUnified'
import SectionManager from './components/admin/studio/SectionManager'
// FieldManager removed - replaced by StudioUnified
import PipelineStudio from './pages/admin/PipelineStudio'
import UserManagement from './pages/admin/UserManagement'
import CategoryManagement from './pages/admin/CategoryManagement'
import LossReasonManagement from './pages/admin/LossReasonManagement'
import CRMHealth from './pages/admin/CRMHealth'
import CardCreationRulesPage from './pages/admin/CardCreationRulesPage'
import Lixeira from './pages/admin/Lixeira'
import Arquivados from './pages/admin/Arquivados'
import { IntegrationsPage } from './components/admin/integrations/IntegrationsPage'
import DeveloperHub from './pages/developer/DeveloperHub'
import { WhatsAppPage } from './components/admin/whatsapp/WhatsAppPage'
import KanbanCardSettings from './components/admin/KanbanCardSettings'
import ActionRequirementsTab from './components/admin/studio/ActionRequirementsTab'
// Cadence Engine v3 (replaces Workflow Engine v2)
import CadenceListPage from './pages/admin/cadence/CadenceListPage'
import CadenceBuilderPage from './pages/admin/cadence/CadenceBuilderPage'
import CadenceMonitorPage from './pages/admin/cadence/CadenceMonitorPage'
import { ToastProvider } from './contexts/ToastContext'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { Toaster, toast } from 'sonner'

const queryClient = new QueryClient({
    queryCache: new QueryCache({
        onError: (error) => {
            console.error('[QueryCache] Query error:', error.message)
            toast.error('Erro ao carregar dados', {
                description: error.message?.includes('42703')
                    ? 'Atualização do sistema em andamento. Tente novamente em alguns minutos.'
                    : 'Verifique sua conexão e tente novamente.',
                id: 'query-error',
            })
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
            refetchOnWindowFocus: 'always',
        },
        mutations: {
            retry: 1,
        },
    },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AuthProvider>
          <ToastProvider>
            <Toaster richColors position="top-right" />
            <BrowserRouter>
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/invite/:token" element={<InvitePage />} />
                <Route path="/p/:token" element={<ProposalView />} />
                <Route path="/p/:token/review" element={<ProposalReview />} />
                <Route path="/p/:token/confirmed" element={<ProposalConfirmed />} />

                {/* Protected Routes */}
                <Route element={<Layout />}>
                  <Route path="/" element={<Navigate to="/dashboard" />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/pipeline" element={<Pipeline />} />
                  <Route path="/leads" element={<Leads />} />
                  <Route path="/groups" element={<GroupsPage />} />
                  <Route path="/trips" element={<Cards />} />
                  <Route path="/cards" element={<Navigate to="/trips" replace />} />
                  <Route path="/cards/:id" element={<CardDetail />} />
                  <Route path="/cards/:id/monde-preview" element={<MondePreviewPage />} />
                  <Route path="/people" element={<People />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/proposals" element={<ProposalsPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />}>
                    <Route index element={<Navigate to="/analytics/overview" replace />} />
                    <Route path="overview" element={<OverviewView />} />
                    <Route path="team" element={<TeamView />} />
                    <Route path="funnel" element={<FunnelView />} />
                    <Route path="sla" element={<SLAView />} />
                    <Route path="whatsapp" element={<WhatsAppView />} />
                    <Route path="operations" element={<OperationsView />} />
                    <Route path="financial" element={<FinancialView />} />
                    <Route path="retention" element={<RetentionView />} />
                  </Route>
                  {/* Custom Reports (módulo separado do Analytics) */}
                  <Route path="/reports" element={<ReportsPage />}>
                    <Route index element={<ReportsList />} />
                    <Route path="new" element={<ReportBuilder />} />
                    <Route path=":id" element={<ReportViewer />} />
                    <Route path=":id/edit" element={<ReportBuilder />} />
                    <Route path="dashboards" element={<DashboardsList />} />
                    <Route path="dashboards/new" element={<DashboardEditor />} />
                    <Route path="dashboards/:id" element={<DashboardViewer />} />
                    <Route path="dashboards/:id/edit" element={<DashboardEditor />} />
                  </Route>
                  <Route path="/proposals/:id/edit" element={<ProposalBuilderV4 />} />
                  <Route path="/proposals/:id/legacy" element={<ProposalBuilderElite />} />

                  {/* Cadências de Vendas */}
                  <Route path="/admin/cadence" element={<CadenceListPage />} />
                  <Route path="/admin/cadence/new" element={<CadenceBuilderPage />} />
                  <Route path="/admin/cadence/:id" element={<CadenceBuilderPage />} />
                  <Route path="/admin/cadence/:id/monitor" element={<CadenceMonitorPage />} />

                  <Route path="/admin" element={<Navigate to="/settings/system/governance" replace />} />

                  {/* Settings Routes */}
                  <Route path="/settings" element={<SettingsPage />}>
                    <Route index element={<Navigate to="/settings/profile" replace />} />
                    <Route path="profile" element={<ProfileSettings />} />

                    {/* Workspace Settings */}
                    <Route path="workspace/general" element={<div className="p-4">Configurações Gerais do Espaço de Trabalho (Em Breve)</div>} />
                    <Route path="workspace/whatsapp" element={<WhatsAppPage />} />

                    {/* ═══════════════════════════════════════════════════════════
                        CUSTOMIZATION: Data Rules & Requirements
                    ═══════════════════════════════════════════════════════════ */}
                    {/* FieldManager replaced by StudioUnified (data-rules) */}
                    <Route path="customization/fields" element={<Navigate to="/settings/customization/data-rules" replace />} />

                    <Route path="customization/sections" element={<SectionManager />} />
                    <Route path="customization/data-rules" element={<StudioUnified />} />
                    <Route path="customization/action-requirements" element={<ActionRequirementsTab />} />

                    {/* AutomationRulesPage replaced by Cadências */}
                    <Route path="customization/automations" element={<Navigate to="/settings/cadence" replace />} />

                    <Route path="customization/categories" element={<CategoryManagement />} />
                    <Route path="customization/loss-reasons" element={<LossReasonManagement />} />

                    {/* Cadências de Vendas (replaces Workflow Engine v2) */}
                    <Route path="cadence" element={<CadenceListPage />} />
                    <Route path="cadence/new" element={<CadenceBuilderPage />} />
                    <Route path="cadence/:id" element={<CadenceBuilderPage />} />
                    <Route path="cadence/:id/monitor" element={<CadenceMonitorPage />} />

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
                    <Route path="team/card-rules" element={<CardCreationRulesPage />} />

                    {/* ═══════════════════════════════════════════════════════════
                        OPERATIONS: Maintenance & Health
                    ═══════════════════════════════════════════════════════════ */}
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
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </ErrorBoundary>
    </QueryClientProvider >
  )
}

export default App
