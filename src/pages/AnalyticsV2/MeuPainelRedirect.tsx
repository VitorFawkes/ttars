import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// "Meu painel" adapta ao papel do usuário. Por enquanto (MVP Fase 3a) só Dono
// está implementado — admin vai pra Dono, outros vão pra Comercial (placeholder).
export default function MeuPainelRedirect() {
  const { profile } = useAuth()
  const target = profile?.is_admin ? '/analytics/v2/dono' : '/analytics/v2/comercial'
  return <Navigate to={target} replace />
}
