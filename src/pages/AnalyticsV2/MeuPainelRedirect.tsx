import { Navigate } from 'react-router-dom'
import { useAnalyticsV2Permissions } from '@/hooks/useAnalyticsV2Permissions'

/**
 * "Meu painel" adapta ao papel do usuário.
 * Redireciona para o dashboard padrão baseado em role/fase.
 */
export default function MeuPainelRedirect() {
  const { defaultDashboard } = useAnalyticsV2Permissions()
  return <Navigate to={defaultDashboard} replace />
}
