import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Combine, Loader2, CheckCircle2, Users, Calendar, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { useWeddingsWithGuestCounts } from '../../hooks/convidados/useWeddingsWithGuestCounts'
import { useFundirCasamentos } from '../../hooks/convidados/useFundirCasamentos'
import {
  findDuplicateWeddings,
  estimateDuplicateGuests,
  type DuplicateWeddingGroup,
} from '../../lib/convidados/findDuplicateWeddings'
import { ETAPA_LABEL } from '../../hooks/convidados/types'

interface Props {
  open: boolean
  onClose: () => void
}

function longDate(iso: string | null): string {
  if (!iso) return 'Sem data'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Sem data'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function UnirCasamentosDuplicadosModal({ open, onClose }: Props) {
  const { data: weddings } = useWeddingsWithGuestCounts()
  const fundir = useFundirCasamentos()

  const groups = useMemo(() => findDuplicateWeddings(weddings), [weddings])

  // Tratamos um grupo por vez — sempre o primeiro da lista detectada.
  const group: DuplicateWeddingGroup | undefined = groups[0]
  const [destinoId, setDestinoId] = useState<string | null>(null)

  // Reseta a escolha de destino quando o grupo ativo muda (ou ao abrir).
  useEffect(() => {
    setDestinoId(group?.suggestedDestinoId ?? null)
  }, [group?.key, group?.suggestedDestinoId])

  if (!open) return null

  const estDuplicados = group ? estimateDuplicateGuests(group) : 0
  const origens = group ? group.weddings.filter(w => w.id !== destinoId) : []
  const destinoWedding = group?.weddings.find(w => w.id === destinoId) ?? null
  const totalConvidados = group?.weddings.reduce((s, w) => s + w.counts.total, 0) ?? 0
  const canConfirm = !fundir.isPending && !!destinoId && origens.length >= 1

  const handleConfirm = async () => {
    if (!destinoId || origens.length === 0) return
    try {
      await fundir.mutateAsync({
        origens: origens.map(o => o.id),
        destino: destinoId,
        motivo: 'Casamentos duplicados unidos pela aba Convidados',
      })
      // Se ainda restarem grupos, o board re-detecta e o modal mostra o próximo.
      // Fecha quando não houver mais nada a unir.
    } catch {
      // toast de erro já é exibido pelo hook
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget && !fundir.isPending) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg bg-white border border-slate-200 shadow-2xl rounded-xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            <Combine className="w-5 h-5 text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">Unir casamentos duplicados</h2>
              <p className="text-xs text-slate-500">
                {groups.length > 0
                  ? `${groups.length} ${groups.length === 1 ? 'duplicata encontrada' : 'duplicatas encontradas'}`
                  : 'Nenhuma duplicata encontrada'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={fundir.isPending}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!group ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-900">Nenhum casamento duplicado.</p>
              <p className="text-xs text-slate-500 mt-1">
                Está tudo certo — não encontramos casais cadastrados em duplicidade.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Cabeçalho do grupo */}
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{group.displayTitle}</span>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Calendar className="w-3.5 h-3.5" /> {longDate(group.weddingDate)}
                </span>
              </div>

              <p className="text-xs text-slate-500">
                Escolha qual casamento <strong>fica</strong> como principal. Os outros serão
                arquivados e suas listas de convidados entram nesse principal.
              </p>

              {/* Opções (radio) */}
              <div className="flex flex-col gap-2">
                {group.weddings.map(w => {
                  const isDestino = w.id === destinoId
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setDestinoId(w.id)}
                      disabled={fundir.isPending}
                      className={cn(
                        'text-left rounded-lg border-2 p-3 transition-all',
                        isDestino ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className={cn(
                          'mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                          isDestino ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white',
                        )}>
                          {isDestino && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900 truncate">{w.titulo}</p>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-600 shrink-0">
                              <Users className="w-3.5 h-3.5" /> {w.counts.total}
                            </span>
                          </div>
                          <p className="text-[11px] mt-1">
                            {isDestino ? (
                              <span className="text-emerald-700 font-medium">Principal — recebe a lista combinada</span>
                            ) : (
                              <span className="text-slate-500">Duplicado — será arquivado</span>
                            )}
                            <span className="text-slate-300"> · </span>
                            <span className="text-slate-500">{ETAPA_LABEL[w.etapa]}</span>
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Resumo */}
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-900 space-y-1">
                <p className="font-medium">Como vai ficar:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>{totalConvidados} convidado{totalConvidados === 1 ? '' : 's'} no total entram em <strong>{destinoWedding?.titulo ?? 'principal'}</strong></li>
                  <li>Quem aparecer repetido (mesmo telefone) é mesclado num só, mantendo o melhor status de presença{estDuplicados > 0 ? ` (~${estDuplicados} repetido${estDuplicados === 1 ? '' : 's'})` : ''}</li>
                  <li>{origens.length} casamento{origens.length === 1 ? '' : 's'} duplicado{origens.length === 1 ? '' : 's'} {origens.length === 1 ? 'é arquivado' : 'são arquivados'} (recuperável na Lixeira)</li>
                </ul>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Convidados repetidos são removidos de verdade ao mesclar. Os casamentos arquivados podem ser recuperados, mas a fusão de convidados não é desfeita automaticamente.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={fundir.isPending}>
            {group ? 'Cancelar' : 'Fechar'}
          </Button>
          {group && (
            <Button onClick={handleConfirm} disabled={!canConfirm} className="gap-1.5">
              {fundir.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Unindo…</>
              ) : (
                <><Combine className="w-4 h-4" /> Unir em "{destinoWedding?.titulo ?? 'principal'}"</>
              )}
            </Button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
