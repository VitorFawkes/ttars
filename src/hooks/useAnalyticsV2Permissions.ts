import { useAuth } from '@/contexts/AuthContext'
import { SystemPhase } from '@/types/pipeline'

interface AnalyticsV2Permissions {
  canSeeDashboards: string[]
  canSeeExplorar: boolean
  defaultDashboard: string
  isAdmin: boolean
  isGestor: boolean
}

/**
 * Hook para determinar permissões de acesso a dashboards do Analytics v2 baseado em role/fase do usuário.
 *
 * Lógica:
 * - **Admin** (profile.is_admin) → vê todos os dashboards + Explorar
 * - **Gestor** (admin OU fase comercial/similar) → vê seu painel default + Comercial + Explorar
 * - **Operador** (demais authenticated users) → vê só seu painel default + Explorar
 *
 * Dashboards mapeados por fase:
 * - sdr → /analytics/v2/sdr
 * - planner → /analytics/v2/vendas
 * - pos_venda → /analytics/v2/pos-venda
 * - comercial (custom) → /analytics/v2/comercial
 * - outro → /analytics/v2/dono (fallback, admin only)
 */
export function useAnalyticsV2Permissions(): AnalyticsV2Permissions {
  const { profile } = useAuth()

  const isAdmin = profile?.is_admin === true

  // Determinar fase do usuário
  const phaseSlug = profile?.team?.phase?.slug

  // Gestor: admin OU tem fase associada (qualquer fase coordena um mini-time)
  // Em contextos Trips/Weddings, gestor é quem tem profile com is_admin OU coordena uma fase
  const isGestor = isAdmin

  // Mapear fase → dashboard padrão
  let defaultDashboard = '/analytics/v2/dono'
  let canSeeDashboards: string[] = []

  if (isAdmin) {
    // Admin vê tudo
    canSeeDashboards = ['dono', 'comercial', 'vendas', 'pos-venda', 'sdr', 'explorar']
    defaultDashboard = '/analytics/v2/dono'
  } else {
    // Operador — mapear pela fase
    switch (phaseSlug) {
      case SystemPhase.SDR:
        canSeeDashboards = ['sdr', 'explorar']
        defaultDashboard = '/analytics/v2/sdr'
        break

      case SystemPhase.PLANNER:
        canSeeDashboards = ['vendas', 'explorar']
        defaultDashboard = '/analytics/v2/vendas'
        break

      case SystemPhase.POS_VENDA:
        canSeeDashboards = ['pos-venda', 'explorar']
        defaultDashboard = '/analytics/v2/pos-venda'
        break

      default:
        // Fallback: usuário sem fase ou fase desconhecida → Explorar (evita loop de redirect em /analytics/v2)
        canSeeDashboards = ['explorar']
        defaultDashboard = '/analytics/v2/explorar'
        break
    }
  }

  return {
    canSeeDashboards,
    canSeeExplorar: true, // Todos veem Explorar
    defaultDashboard,
    isAdmin,
    isGestor,
  }
}
