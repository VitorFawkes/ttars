import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { ConversationState, EngajamentoConversation } from '@/types/engagement'

interface Props {
  conversations: EngajamentoConversation[]
  isLoading?: boolean
  pagination: { page: number; limit: number; total: number }
  onPageChange: (page: number) => void
  onRowClick: (conversation: EngajamentoConversation) => void
  activeFilters?: { label: string; onClear: () => void }[]
}

const STATE_BADGE: Record<ConversationState, { label: string; className: string; dot: string }> = {
  hot:  { label: 'Quente',          className: 'bg-rose-50 text-rose-700 ring-rose-100',     dot: 'bg-rose-500' },
  warm: { label: 'Morna',           className: 'bg-amber-50 text-amber-700 ring-amber-100',  dot: 'bg-amber-500' },
  lost: { label: 'Sumiu',           className: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-500' },
  cold: { label: 'Nunca respondeu', className: 'bg-slate-50 text-slate-500 ring-slate-200',  dot: 'bg-slate-300' },
  won:  { label: 'Ganha',           className: 'bg-emerald-50 text-emerald-700 ring-emerald-100', dot: 'bg-emerald-500' },
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR })
  } catch {
    return iso
  }
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return format(new Date(iso), 'dd/MM HH:mm', { locale: ptBR })
  } catch {
    return iso
  }
}

function formatHours(hours: number | null): string {
  if (hours === null || hours === undefined || hours < 0) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}min`
  if (hours < 24) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function formatPhone(phone: string): string {
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
  activeFilters,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit))
  const startIdx = (pagination.page - 1) * pagination.limit + 1
  const endIdx = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 tracking-tight">Conversas</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Clique em uma linha pra ver a thread completa
            </p>
          </div>
          {!isLoading && pagination.total > 0 && (
            <div className="text-xs text-slate-500 tabular-nums">
              {startIdx}–{endIdx} de {pagination.total.toLocaleString('pt-BR')}
            </div>
          )}
        </div>

        {activeFilters && activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
              Filtros ativos:
            </span>
            {activeFilters.map((f, idx) => (
              <button
                key={idx}
                onClick={f.onClear}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100"
              >
                {f.label}
                <span className="text-indigo-400">×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 text-slate-500 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Pessoa</th>
              <th className="px-4 py-2.5 text-left font-semibold">Linha</th>
              <th className="px-4 py-2.5 text-right font-semibold">In</th>
              <th className="px-4 py-2.5 text-right font-semibold">Out</th>
              <th className="px-4 py-2.5 text-right font-semibold">1ª resp.</th>
              <th className="px-4 py-2.5 text-left font-semibold">Nossa 1ª msg</th>
              <th className="px-4 py-2.5 text-left font-semibold">Nossa última</th>
              <th className="px-4 py-2.5 text-left font-semibold">Dela última</th>
              <th className="px-4 py-2.5 text-right font-semibold">Duração</th>
              <th className="px-4 py-2.5 text-left font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <>
                {[1, 2, 3, 4, 5].map(i => (
                  <tr key={i} className="animate-pulse">
                    {Array(10).fill(0).map((_, j) => (
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
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">
                  Nenhuma conversa encontrada com os filtros atuais.
                </td>
              </tr>
            )}

            {!isLoading &&
              conversations.map(c => {
                const badge = STATE_BADGE[c.state] ?? STATE_BADGE.cold
                const displayName = c.contact_name || (
                  <span className="italic text-slate-400">Sem cadastro</span>
                )
                return (
                  <tr
                    key={`${c.customer_phone}-${c.phone_line_label}`}
                    onClick={() => onRowClick(c)}
                    className="cursor-pointer hover:bg-indigo-50/40 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900 truncate max-w-[180px]">
                        {displayName}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[180px] tabular-nums">
                        {formatPhone(c.customer_phone)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs truncate max-w-[130px]">
                      {c.phone_line_label}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {c.inbound_count}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {c.outbound_count}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 text-xs">
                      {formatHours(c.frt_hours)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs tabular-nums">
                      {formatShortDate(c.first_outbound_at)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs tabular-nums">
                      {formatShortDate(c.last_outbound_at)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {formatRelative(c.last_inbound_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 text-xs">
                      {c.conversation_duration_days !== null
                        ? c.conversation_duration_days < 1
                          ? `${Math.round(c.conversation_duration_days * 24)}h`
                          : `${c.conversation_duration_days.toFixed(1)}d`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1',
                          badge.className
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', badge.dot)} />
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
              className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
              style={{ transition: 'transform 120ms ease-out, background-color 150ms ease' }}
            >
              ← Anterior
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, pagination.page + 1))}
              disabled={pagination.page >= totalPages}
              className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
              style={{ transition: 'transform 120ms ease-out, background-color 150ms ease' }}
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
