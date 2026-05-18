import { useMemo, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/Button'
import { AlertTriangle, CheckCircle2, Clock, ListChecks, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useCancellationTasksForCard,
  useCancelarItemViagem,
  useConcluirCancelamento,
  useDescancelarItemViagem,
  useMotivosCancelamento,
  useReabrirCancelamento,
  modoCancelamentoLabel,
  type ViagemCancelamentoState,
} from '@/hooks/cancelamento/useCancelamento'
import { useViagemByCardId, type TripItemInterno } from '@/hooks/viagem/useViagemInterna'
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal'

interface CancellationPanelProps {
  open: boolean
  onClose: () => void
  cardId: string
  state: ViagemCancelamentoState
}

function formatData(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function itemTitulo(item: TripItemInterno): string {
  const c = item.comercial as { titulo?: string } | null
  return c?.titulo || item.tipo
}

export function CancellationPanel({ open, onClose, cardId, state }: CancellationPanelProps) {
  const { data: viagemData } = useViagemByCardId(cardId)
  const items = viagemData?.items ?? []
  const { data: tarefas = [] } = useCancellationTasksForCard(cardId)
  const { data: motivos = [] } = useMotivosCancelamento(state.org_id, null)

  const cancelarItem = useCancelarItemViagem()
  const descancelarItem = useDescancelarItemViagem()
  const concluir = useConcluirCancelamento()
  const reabrir = useReabrirCancelamento()

  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null)
  const [itemMotivo, setItemMotivo] = useState('')

  const motivoNome = useMemo(
    () => motivos.find((m) => m.id === state.motivo_cancelamento_id)?.nome ?? null,
    [motivos, state.motivo_cancelamento_id],
  )

  const itensCancelados = items.filter((it) => (it as TripItemInterno & { cancelado_em?: string | null }).cancelado_em)
  const itensVivos = items.filter((it) => !(it as TripItemInterno & { cancelado_em?: string | null }).cancelado_em)

  const tarefasPendentes = tarefas.filter((t) => t.concluida !== true)
  const concluido = !!state.cancelamento_concluido_em
  const podeReabrir = useMemo(() => {
    if (!state.cancelamento_concluido_em) return false
    const diff = Date.now() - new Date(state.cancelamento_concluido_em).getTime()
    return diff <= 30 * 86_400_000
  }, [state.cancelamento_concluido_em])

  const handleConfirmCancelItem = () => {
    if (!confirmingItemId) return
    cancelarItem.mutate(
      { itemId: confirmingItemId, motivo: itemMotivo.trim() || null },
      {
        onSuccess: () => {
          setConfirmingItemId(null)
          setItemMotivo('')
        },
      },
    )
  }

  const handleConcluir = () => {
    if (tarefasPendentes.length > 0) {
      if (!window.confirm(`Há ${tarefasPendentes.length} tarefa(s) pendente(s). Concluir mesmo assim?`)) {
        return
      }
    }
    concluir.mutate(state.viagem_id, {
      onSuccess: () => {
        onClose()
      },
    })
  }

  const handleReabrir = () => {
    if (!window.confirm('Reabrir cancelamento? O card volta à etapa anterior se era cancelamento total.')) return
    reabrir.mutate(state.viagem_id)
  }

  const extraMetadataParaTarefa = useMemo(
    () => ({
      origem:
        state.modo_cancelamento === 'total'
          ? 'cancelamento_total'
          : state.modo_cancelamento === 'mudanca_brusca'
            ? 'cancelamento_mudanca'
            : 'cancelamento_parcial',
      viagem_id: state.viagem_id,
    }),
    [state.modo_cancelamento, state.viagem_id],
  )

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-[640px] overflow-y-auto bg-white">
          <SheetHeader className="space-y-3 pb-4 border-b border-slate-200">
            <SheetTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              Painel de Cancelamento
            </SheetTitle>
            <div className="text-sm space-y-1">
              <div>
                <span className="text-slate-500">Tipo:</span>{' '}
                <span className="font-medium text-slate-900">
                  {state.modo_cancelamento ? modoCancelamentoLabel(state.modo_cancelamento) : '—'}
                </span>
                {concluido && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    <CheckCircle2 className="w-3 h-3" /> Concluído
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-500">Motivo:</span>{' '}
                <span className="font-medium text-slate-900">{motivoNome ?? '—'}</span>
              </div>
              {state.motivo_cancelamento_obs && (
                <div className="text-slate-700 italic text-xs bg-slate-50 p-2 rounded">
                  &ldquo;{state.motivo_cancelamento_obs}&rdquo;
                </div>
              )}
              <div className="text-xs text-slate-500">
                Aberto em {formatData(state.cancelamento_aberto_em)}
                {concluido && (
                  <> · Concluído em {formatData(state.cancelamento_concluido_em)}</>
                )}
              </div>
            </div>
          </SheetHeader>

          <div className="py-5 space-y-6">
            {/* Itens cancelados */}
            {itensCancelados.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-red-600" />
                  Itens cancelados ({itensCancelados.length})
                </h3>
                <div className="space-y-1.5">
                  {itensCancelados.map((it) => {
                    const cancelado = it as TripItemInterno & { cancelado_em?: string | null; cancelado_motivo?: string | null }
                    return (
                      <div
                        key={it.id}
                        className="flex items-start justify-between gap-2 p-2 bg-red-50/50 border border-red-100 rounded"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 line-through">{itemTitulo(it)}</div>
                          <div className="text-xs text-slate-500">
                            {it.tipo}
                            {cancelado.cancelado_motivo && <> · {cancelado.cancelado_motivo}</>}
                          </div>
                        </div>
                        {!concluido && (
                          <button
                            type="button"
                            onClick={() => descancelarItem.mutate(it.id)}
                            disabled={descancelarItem.isPending}
                            className="text-xs text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline shrink-0 inline-flex items-center gap-1"
                          >
                            <Undo2 className="w-3 h-3" />
                            Desfazer
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Itens vivos */}
            {!concluido && itensVivos.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-slate-600" />
                  Itens da viagem ({itensVivos.length})
                </h3>
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                  {itensVivos.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between gap-2 p-2 bg-white border border-slate-200 rounded hover:border-slate-300"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{itemTitulo(it)}</div>
                        <div className="text-xs text-slate-500">{it.tipo}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-700 hover:bg-red-50 shrink-0"
                        onClick={() => {
                          setConfirmingItemId(it.id)
                          setItemMotivo('')
                        }}
                        disabled={cancelarItem.isPending}
                      >
                        Cancelar este
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Tarefas do cancelamento */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Tarefas do cancelamento ({tarefas.length})
                </h3>
                {!concluido && (
                  <Button size="sm" variant="outline" onClick={() => setCreateTaskOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Nova tarefa
                  </Button>
                )}
              </div>
              {tarefas.length === 0 ? (
                <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded border border-slate-200">
                  Nenhuma tarefa criada ainda. Crie tarefas pra você ou pro pós-venda executar.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {tarefas.map((t) => (
                    <div
                      key={t.id}
                      className={cn(
                        'flex items-start gap-2 p-2 border rounded',
                        t.concluida
                          ? 'bg-emerald-50/50 border-emerald-100'
                          : 'bg-white border-slate-200',
                      )}
                    >
                      <div className="mt-0.5">
                        {t.concluida ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-amber-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            'text-sm font-medium',
                            t.concluida ? 'text-slate-500 line-through' : 'text-slate-900',
                          )}
                        >
                          {t.titulo}
                        </div>
                        <div className="text-xs text-slate-500">
                          {t.responsavel_nome ? `→ ${t.responsavel_nome}` : '→ sem responsável'}
                          {t.data_vencimento && (
                            <> · vence {new Date(t.data_vencimento).toLocaleDateString('pt-BR')}</>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Footer com ações */}
          <div className="border-t border-slate-200 pt-4 pb-2 flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            {!concluido ? (
              <Button
                onClick={handleConcluir}
                disabled={concluir.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {concluir.isPending ? 'Concluindo…' : 'Concluir cancelamento'}
              </Button>
            ) : podeReabrir ? (
              <Button onClick={handleReabrir} disabled={reabrir.isPending} variant="outline">
                <RotateCcw className="w-4 h-4 mr-1" />
                {reabrir.isPending ? 'Reabrindo…' : 'Reabrir cancelamento'}
              </Button>
            ) : (
              <span className="text-xs text-slate-500">Janela de reabertura (30 dias) expirada</span>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal de confirmação ao cancelar item */}
      {confirmingItemId && (
        <Sheet open={true} onOpenChange={(o) => !o && setConfirmingItemId(null)}>
          <SheetContent side="right" className="w-full sm:max-w-[420px] bg-white">
            <SheetHeader>
              <SheetTitle>Cancelar este item?</SheetTitle>
            </SheetHeader>
            <div className="py-4 space-y-3">
              <p className="text-sm text-slate-700">
                O item será marcado como cancelado e arquivado. Itens financeiros relacionados
                serão sinalizados automaticamente.
              </p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Motivo desse item (opcional)</label>
                <textarea
                  value={itemMotivo}
                  onChange={(e) => setItemMotivo(e.target.value)}
                  placeholder="Ex: fornecedor não vai entregar"
                  className="w-full min-h-[80px] rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setConfirmingItemId(null)}>
                Voltar
              </Button>
              <Button
                onClick={handleConfirmCancelItem}
                disabled={cancelarItem.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Cancelar item
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Modal de criar tarefa do cancelamento */}
      <CreateTaskModal
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        initialCardId={cardId}
        extraMetadata={extraMetadataParaTarefa}
      />
    </>
  )
}
