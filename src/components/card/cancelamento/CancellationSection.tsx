import { useState } from 'react'
import { AlertOctagon } from 'lucide-react'
import {
  useCancellationStateByCard,
  useCancellationTasksForCard,
} from '@/hooks/cancelamento/useCancelamento'
import { useViagemByCardId, type TripItemInterno } from '@/hooks/viagem/useViagemInterna'
import { CancellationBanner, CancellationCompletedBanner } from './CancellationBanner'
import CancellationOpenModal from './CancellationOpenModal'
import { CancellationPanel } from './CancellationPanel'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface CancellationSectionProps {
  cardId: string
}

/** Estados em que faz sentido oferecer "Abrir cancelamento" (viagem >= confirmada). */
const ESTADOS_POS_ACEITE = [
  'confirmada',
  'em_montagem',
  'aguardando_embarque',
  'em_andamento',
  'pos_viagem',
  'concluida',
]

/** Conjunto único que CardDetail importa.
 *  Mostra banner âmbar (durante modo), banner cinza (até 7d após conclusão),
 *  ou um botão discreto "Abrir cancelamento" quando aplicável. */
export function CancellationSection({ cardId }: CancellationSectionProps) {
  const { data: state } = useCancellationStateByCard(cardId)
  const { data: viagemData } = useViagemByCardId(cardId)
  const { data: tarefas = [] } = useCancellationTasksForCard(cardId)

  const [openModalOpen, setOpenModalOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  const motivoQuery = useQuery({
    queryKey: ['motivo-cancelamento-single', state?.motivo_cancelamento_id ?? 'none'],
    queryFn: async () => {
      if (!state?.motivo_cancelamento_id) return null
      const { data } = await supabase
        .from('motivos_cancelamento')
        .select('nome')
        .eq('id', state.motivo_cancelamento_id)
        .maybeSingle()
      return (data as { nome?: string } | null)?.nome ?? null
    },
    enabled: !!state?.motivo_cancelamento_id,
    staleTime: 60_000,
  })

  if (!viagemData?.viagem) return null

  const viagem = viagemData.viagem
  const items = viagemData.items
  const podeAbrir = ESTADOS_POS_ACEITE.includes(viagem.estado as string)
  const modoAtivo = !!state?.modo_cancelamento && !state.cancelamento_concluido_em
  const concluidoRecente = !!state?.cancelamento_concluido_em

  const itensCanceladosCount = items.filter(
    (it) => (it as TripItemInterno & { cancelado_em?: string | null }).cancelado_em,
  ).length
  const tarefasPendentesCount = tarefas.filter((t) => t.concluida !== true).length

  return (
    <>
      {/* Banner durante modo ativo */}
      {state && modoAtivo && (
        <CancellationBanner
          state={state}
          motivoNome={motivoQuery.data ?? null}
          itensCanceladosCount={itensCanceladosCount}
          tarefasPendentesCount={tarefasPendentesCount}
          onOpenPanel={() => setPanelOpen(true)}
        />
      )}

      {/* Banner secundário 7 dias após conclusão (parcial/mudança) */}
      {state && concluidoRecente && !modoAtivo && (
        <CancellationCompletedBanner
          state={state}
          itensCanceladosCount={itensCanceladosCount}
          tarefasPendentesCount={tarefasPendentesCount}
          onOpenPanel={() => setPanelOpen(true)}
        />
      )}

      {/* Botão pequeno pra abrir cancelamento — quando viagem >= confirmada e sem modo ativo */}
      {podeAbrir && !modoAtivo && !concluidoRecente && (
        <div className="flex justify-end pt-1 pb-2 px-3">
          <button
            type="button"
            onClick={() => setOpenModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-700 transition-colors"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            Abrir cancelamento
          </button>
        </div>
      )}

      {/* Modal de abertura */}
      <CancellationOpenModal
        isOpen={openModalOpen}
        onClose={() => setOpenModalOpen(false)}
        viagemId={viagem.id}
        orgId={viagem.org_id}
        onOpened={() => setPanelOpen(true)}
      />

      {/* Painel (drawer) */}
      {state && (
        <CancellationPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          cardId={cardId}
          state={state}
        />
      )}
    </>
  )
}
