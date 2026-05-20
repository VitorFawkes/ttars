import { useState, useEffect } from 'react'
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
}

/** Conjunto único que CardDetail importa.
 *  Renderiza banner âmbar (durante modo ativo) e banner cinza (até 7d após
 *  conclusão parcial/mudança). O gatilho para abrir o modal não vive aqui —
 *  fica no mega-menu "Ações" do card, que dispara o evento `open-cancellation`.
 *
 *  Funciona mesmo para cards sem `viagens` row — cria uma viagem implícita
 *  quando o evento dispara a abertura. */
export function CancellationSection({ cardId }: CancellationSectionProps) {
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

  const viagem = viagemData?.viagem ?? null
  const items = viagemData?.items ?? []
  const modoAtivo = !!state?.modo_cancelamento && !state.cancelamento_concluido_em
  const concluidoRecente = !!state?.cancelamento_concluido_em

  const itensCanceladosCount = items.filter(
    (it) => (it as TripItemInterno & { cancelado_em?: string | null }).cancelado_em,
  ).length
  const tarefasPendentesCount = tarefas.filter((t) => t.concluida !== true).length

  const handleOpenCancelamento = async () => {
    // Se já há cancelamento em curso, abre direto o painel.
    if (modoAtivo) {
      setPanelOpen(true)
      return
    }
    if (viagem) {
      setOpenModalOpen(true)
      return
    }
    setCriandoViagem(true)
    try {
      await criarViagem.mutateAsync({ cardId, hidratar: false })
      await queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
      setOpenModalOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao preparar viagem')
    } finally {
      setCriandoViagem(false)
    }
  }

  // Escuta o evento disparado pelo item "Cancelar viagem" do mega-menu Ações.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { cardId?: string } | undefined
      if (detail?.cardId !== cardId) return
      void handleOpenCancelamento()
    }
    window.addEventListener('open-cancellation', onOpen)
    return () => window.removeEventListener('open-cancellation', onOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, viagem?.id, modoAtivo])

  if (criandoViagem) {
    // No-op visual — toast já dá feedback se falhar; placeholder some quando viagem cria.
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
