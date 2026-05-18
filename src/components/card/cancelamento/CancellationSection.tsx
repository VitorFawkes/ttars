import { useState } from 'react'
import { AlertOctagon, Loader2 } from 'lucide-react'
import {
  useCancellationStateByCard,
  useCancellationTasksForCard,
} from '@/hooks/cancelamento/useCancelamento'
import { useViagemByCardId, useCriarViagem, type TripItemInterno } from '@/hooks/viagem/useViagemInterna'
import { CancellationBanner, CancellationCompletedBanner } from './CancellationBanner'
import CancellationOpenModal from './CancellationOpenModal'
import { CancellationPanel } from './CancellationPanel'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface CancellationSectionProps {
  cardId: string
  /** True quando o cliente já aceitou a viagem (passou pelo Planner para pós-venda). */
  cardGanhoPlanner: boolean | null
  cardStatusComercial: string | null
}

/** Conjunto único que CardDetail importa.
 *  Mostra banner âmbar (durante modo), banner cinza (até 7d após conclusão),
 *  ou um botão discreto "Abrir cancelamento" quando aplicável.
 *
 *  Funciona mesmo para cards sem `viagens` row — cria uma viagem implícita
 *  na hora de abrir cancelamento. */
export function CancellationSection({ cardId, cardGanhoPlanner, cardStatusComercial }: CancellationSectionProps) {
  const { data: state } = useCancellationStateByCard(cardId)
  const { data: viagemData } = useViagemByCardId(cardId)
  const { data: tarefas = [] } = useCancellationTasksForCard(cardId)
  const criarViagem = useCriarViagem()
  const queryClient = useQueryClient()

  const [openModalOpen, setOpenModalOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [criandoViagem, setCriandoViagem] = useState(false)

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

  // Mostrar a UI pra qualquer card de Welcome Trips que já tenha sido aceito pelo cliente
  // (ganho_planner=true significa que o cliente confirmou a viagem e ela foi pra pós-venda),
  // OU que esteja com status_comercial='ganho' (fechou ciclo completo).
  // Não aparece em cards perdidos.
  const podeAbrir =
    cardStatusComercial !== 'perdido' &&
    (cardGanhoPlanner === true || cardStatusComercial === 'ganho')

  const viagem = viagemData?.viagem ?? null
  const items = viagemData?.items ?? []
  const modoAtivo = !!state?.modo_cancelamento && !state.cancelamento_concluido_em
  const concluidoRecente = !!state?.cancelamento_concluido_em

  const itensCanceladosCount = items.filter(
    (it) => (it as TripItemInterno & { cancelado_em?: string | null }).cancelado_em,
  ).length
  const tarefasPendentesCount = tarefas.filter((t) => t.concluida !== true).length

  const handleOpenCancelamento = async () => {
    if (viagem) {
      setOpenModalOpen(true)
      return
    }
    // Sem viagem ainda — criar implicitamente (sem hidratação automática)
    setCriandoViagem(true)
    try {
      await criarViagem.mutateAsync({ cardId, hidratar: false })
      // Aguarda o refresh de useViagemByCardId
      await queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
      setOpenModalOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao preparar viagem')
    } finally {
      setCriandoViagem(false)
    }
  }

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

      {/* Botão pequeno pra abrir cancelamento — quando card está vendido e sem modo ativo */}
      {podeAbrir && !modoAtivo && !concluidoRecente && (
        <div className="flex justify-end pt-1 pb-2 px-3">
          <button
            type="button"
            onClick={handleOpenCancelamento}
            disabled={criandoViagem}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-700 transition-colors disabled:opacity-50"
          >
            {criandoViagem ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <AlertOctagon className="w-3.5 h-3.5" />
            )}
            {criandoViagem ? 'Preparando…' : 'Abrir cancelamento'}
          </button>
        </div>
      )}

      {/* Modal de abertura — só renderiza quando viagem existe */}
      {viagem && (
        <CancellationOpenModal
          isOpen={openModalOpen}
          onClose={() => setOpenModalOpen(false)}
          viagemId={viagem.id}
          orgId={viagem.org_id}
          onOpened={() => setPanelOpen(true)}
        />
      )}

      {/* Painel (drawer) — só renderiza com state */}
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
