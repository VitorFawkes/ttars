/**
 * TripPortalPublic — Página pública da viagem do cliente.
 *
 * Rota: /v/:token
 *
 * Uma única URL que muda de aparência conforme o estado da viagem:
 * - desenho: "Sua viagem está sendo preparada"
 * - em_recomendacao/em_aprovacao: modo decisão (aprovar, escolher, comentar)
 * - confirmada/em_montagem: modo preparação (vouchers, contatos)
 * - aguardando_embarque: contagem regressiva
 * - em_andamento: modo viagem (hoje, contatos de emergência)
 * - pos_viagem/concluida: modo memória (NPS, álbum)
 */

import { useParams } from 'react-router-dom'
import { useViagem } from '@/hooks/viagem/useViagem'
import { ViagemClientePage } from '@/components/viagem/ViagemClientePage'
import { Loader2, AlertCircle } from 'lucide-react'

export default function TripPortalPublic() {
  const { token } = useParams<{ token: string }>()
  const { viagem, days, orphans, comments, isLoading, error } = useViagem(token)

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (error || !viagem) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-900 mb-2">
            Viagem não encontrada
          </h1>
          <p className="text-sm text-slate-500">
            Este link pode ter expirado ou não existe. Entre em contato com sua consultora.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ViagemClientePage
      viagem={viagem}
      days={days}
      orphans={orphans}
      comments={comments}
      token={token!}
    />
  )
}
