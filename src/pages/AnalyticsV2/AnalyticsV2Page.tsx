import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAnalyticsV2Permissions } from '@/hooks/useAnalyticsV2Permissions'
import AnalyticsV2Sidebar from './AnalyticsV2Sidebar'
import UniversalFilterBar from './UniversalFilterBar'

/**
 * AnalyticsV2Page — Layout principal com sidebar + filtros + outlet.
 *
 * Permissões:
 * - Admin vê todos os dashboards
 * - Operador vê apenas seu dashboard padrão (bloqueado acesso direto via URL a otros)
 * - Se tentar acessar dashboard sem permissão, redireciona para dashboard permitido
 */
export default function AnalyticsV2Page() {
  const { loading } = useAuth()
  const { canSeeDashboards, defaultDashboard } = useAnalyticsV2Permissions()
  const location = useLocation()

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-slate-500">Carregando…</div>
      </div>
    )
  }

  // Guard: verificar se a rota atual é permitida
  // Extrair o dashboard da URL (ex: /analytics/sdr → 'sdr')
  const pathParts = location.pathname.split('/')
  const currentDashboard = pathParts[pathParts.length - 1]

  // Se está em /analytics (MeuPainelRedirect), deixa passar (vai redirecionar pro default)
  // Se está em um dashboard específico, valida permissão
  if (
    currentDashboard &&
    currentDashboard !== 'analytics' &&
    currentDashboard !== 'explorar' &&
    !canSeeDashboards.includes(currentDashboard)
  ) {
    return <Navigate to={defaultDashboard} replace />
  }

  return (
    <div className="h-full flex bg-slate-50">
      <AnalyticsV2Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <UniversalFilterBar />
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
