import { useMemo } from 'react'
import { AlertCircle, MessageCircle, Plane, FileQuestion } from 'lucide-react'
import type { TripItemInterno } from '@/hooks/viagem/useViagemInterna'
import { useTripComments } from '@/hooks/viagem/useTripComments'

/**
 * Item precisa de voucher quando aprovado/operacional e sem voucher_url.
 * Dia e itens não-operacionais (texto, dica) são ignorados.
 */
function needsVoucher(item: TripItemInterno): boolean {
  if (!['aprovado', 'operacional'].includes(item.status)) return false
  if (['dia', 'texto', 'dica', 'checklist'].includes(item.tipo)) return false
  const op = item.operacional as Record<string, unknown>
  return !op?.voucher_url
}

function earliestDepartureDate(items: TripItemInterno[]): string | null {
  const candidatas: string[] = []
  for (const item of items) {
    const op = item.operacional as { data_inicio?: string | null }
    if (op?.data_inicio) candidatas.push(op.data_inicio)
    const com = item.comercial as { data_inicio?: string | null }
    if (com?.data_inicio) candidatas.push(com.data_inicio)
  }
  if (candidatas.length === 0) return null
  candidatas.sort()
  return candidatas[0]
}

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

interface Props {
  viagemId: string
  items: TripItemInterno[]
  viagemEstado: string
  onFocusItem: (itemId: string) => void
}

export function InboxPVPanel({ viagemId, items, viagemEstado, onFocusItem }: Props) {
  const { data: comments = [] } = useTripComments(viagemId)

  // Só mostra no fluxo pós-aceite
  const show = ['confirmada', 'em_montagem', 'aguardando_embarque', 'em_andamento'].includes(viagemEstado)

  const pendencias = useMemo(() => {
    if (!show) return { vouchers: [], semResposta: [], embarque: null as string | null }

    const vouchers = items.filter(needsVoucher)

    // Comentários de cliente sem resposta: último comment em cada thread é do cliente
    const byThread = new Map<string | null, typeof comments>()
    for (const c of comments) {
      const key = c.item_id
      const arr = byThread.get(key) ?? []
      arr.push(c)
      byThread.set(key, arr)
    }
    const semResposta = Array.from(byThread.entries())
      .map(([itemId, msgs]) => {
        const sorted = [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at))
        const last = sorted[sorted.length - 1]
        return { itemId, last }
      })
      .filter((t) => t.last.autor === 'client' && !t.last.interno)

    const embarque = earliestDepartureDate(items)

    return { vouchers, semResposta, embarque }
  }, [items, comments, show])

  if (!show) return null

  const totalPendencias =
    pendencias.vouchers.length +
    pendencias.semResposta.length +
    (pendencias.embarque && daysUntil(pendencias.embarque) <= 2 && pendencias.vouchers.length > 0 ? 1 : 0)

  if (totalPendencias === 0 && !pendencias.embarque) return null

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-amber-50/50 px-4 py-2">
      <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
      <span className="text-xs font-medium text-amber-900">Caixa do Pós-Venda:</span>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {pendencias.vouchers.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const first = pendencias.vouchers[0]
              if (first) onFocusItem(first.id)
            }}
            className="flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
          >
            <FileQuestion className="h-3 w-3" />
            {pendencias.vouchers.length} voucher{pendencias.vouchers.length > 1 ? 's' : ''} pendente{pendencias.vouchers.length > 1 ? 's' : ''}
          </button>
        )}

        {pendencias.semResposta.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const first = pendencias.semResposta[0]
              if (first.itemId) onFocusItem(first.itemId)
            }}
            className="flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
          >
            <MessageCircle className="h-3 w-3" />
            {pendencias.semResposta.length} cliente{pendencias.semResposta.length > 1 ? 's' : ''} esperando resposta
          </button>
        )}

        {pendencias.embarque && (
          <span
            className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
              daysUntil(pendencias.embarque) <= 2
                ? 'border-red-200 bg-red-50 text-red-800'
                : daysUntil(pendencias.embarque) <= 7
                  ? 'border-orange-200 bg-orange-50 text-orange-800'
                  : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <Plane className="h-3 w-3" />
            {daysUntil(pendencias.embarque) <= 0
              ? 'em andamento'
              : `embarca em ${daysUntil(pendencias.embarque)} dia${daysUntil(pendencias.embarque) !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>
    </div>
  )
}
