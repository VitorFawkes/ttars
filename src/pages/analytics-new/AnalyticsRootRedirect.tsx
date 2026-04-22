import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { SystemPhase } from '@/types/pipeline'

export default function AnalyticsRootRedirect() {
  const { profile } = useAuth()
  if (profile?.is_admin) return <Navigate to="/analytics/pipeline" replace />
  const slug = profile?.team?.phase?.slug
  if (slug === SystemPhase.SDR) return <Navigate to="/analytics/whatsapp" replace />
  if (slug === SystemPhase.POS_VENDA) return <Navigate to="/analytics/operacoes" replace />
  return <Navigate to="/analytics/resumo" replace />
}
