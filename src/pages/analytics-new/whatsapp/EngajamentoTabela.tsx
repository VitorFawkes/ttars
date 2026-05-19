import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { ConversationState, EngajamentoConversation } from '@/types/engagement'

interface Props {
  conversations: EngajamentoConversation[]
  isLoading?: boolean
  pagination: { page: number; limit: number; total: number }
  onPageChange: (page: number) => void
  onRowClick: (conversation: EngajamentoConversation) => void
}

const STATE_BADGE: Record<ConversationState, { label: string; className: string }> = {
  hot:  { label: 'Quente',          className: 'bg-rose-100 text-rose-700 border-rose-200' },
  warm: { label: 'Morna',           className: 'bg-amber-100 text-amber-700 border-amber-200' },
  lost: { label: 'Sumiu',           className: 'bg-slate-100 text-slate-600 border-slate-200' },
  cold: { label: 'Nunca respondeu', className: 'bg-slate-50 text-slate-500 border-slate-200' },
  won:  { label: 'Ganha',           className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR })
  } catch {
    return iso
  }
}

function formatHours(hours: number | null): string {
  if (hours === null || hours === undefined) return '—'
  if (hours < 0) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}min`
  if (hours < 24) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function formatPhone(phone: string): string {
  // Best-effort formatting for BR phone numbers (55 + DDD + 8/9 digits)
  if (phone.length === 13 && phone.startsWith('55')) {
    return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`
  }
  if (phone.length === 12 && phone.startsWith('55')) {
    return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 8)}-${phone.slice(8)}`
  }
  return phone
}

export default function EngajamentoTabela({
  conversations,
  isLoading,
  pagination,
  onPageChange,
  onRowClick,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit))
  const startIdx = (pagination.page - 1) * pagination.limit + 1
  const endIdx = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">Conversas</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Clique numa linha pra ver a thread completa.
          </p>
        </div>
        {!isLoading && pagination.total > 0 && (
          <div className="text-xs text-slate-500">
            {startIdx}–{endIdx} de {pagination.total.toLocaleString('pt-BR')}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Pessoa</th>
              <th className="px-4 py-3 text-left font-medium">Linha</th>
              <th className="px-4 py-3 text-right font-medium">Recebidas</th>
              <th className="px-4 py-3 text-right font-medium">Enviadas</th>
              <th className="px-4 py-3 text-right font-medium">1ª resp.</th>
              <th className="px-4 py-3 text-left font-medium">Última msg dela</th>
              <th className="px-4 py-3 text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <>
                {[1, 2, 3, 4, 5].map(i => (
                  <tr key={i} className="animate-pulse">
                    {[1, 2, 3, 4, 5, 6, 7].map(j => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-slate-100 rounded w-16" />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}

            {!isLoading && conversations.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                  Nenhuma conversa encontrada com os filtros atuais.
                </td>
              </tr>
            )}

            {!isLoading &&
              conversations.map(c => {
                const badge = STATE_BADGE[c.state] ?? STATE_BADGE.cold
                const displayName = c.contact_name || (
                  <span className="italic text-slate-400">(sem cadastro)</span>
                )
                return (
                  <tr
                    key={`${c.customer_phone}-${c.phone_line_label}`}
                    onClick={() => onRowClick(c)}
                    className="cursor-pointer hover:bg-indigo-50/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 truncate max-w-[200px]">
                        {displayName}
                      </div>
                      <div className="text-xs text-slate-400 truncate max-w-[200px]">
                        {formatPhone(c.customer_phone)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[160px]">
                      {c.phone_line_label}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {c.inbound_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {c.outbound_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatHours(c.frt_hours)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {formatRelative(c.last_inbound_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-sm">
          <div className="text-xs text-slate-500">
            Página {pagination.page} de {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, pagination.page + 1))}
              disabled={pagination.page >= totalPages}
              className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
