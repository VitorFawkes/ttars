import { useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactivationFilters, DaysSinceContactRange, LastTripRange, BirthdayWindow } from '@/hooks/useReactivationPatterns'
import { useReactivationFacets } from '@/hooks/useReactivationFacets'

interface Props {
    filters: ReactivationFilters
    onChange: (patch: Partial<ReactivationFilters>) => void
    currentUserId?: string | null
}

const DAYS_CONTACT: { value: DaysSinceContactRange; label: string }[] = [
    { value: 'any', label: 'Qualquer' },
    { value: 'lt30', label: '< 30 dias' },
    { value: '30_90', label: '30–90 dias' },
    { value: '90_180', label: '3–6 meses' },
    { value: '180_365', label: '6–12 meses' },
    { value: 'gt365', label: '+ 1 ano' },
]
const LAST_TRIP: { value: LastTripRange; label: string }[] = [
    { value: 'any', label: 'Qualquer' },
    { value: 'lt1y', label: 'Últimos 12m' },
    { value: '1_2y', label: '1–2 anos' },
    { value: '2_3y', label: '2–3 anos' },
    { value: 'gt3y', label: '+ 3 anos' },
]
const BDAY: { value: BirthdayWindow; label: string }[] = [
    { value: 'any', label: 'Qualquer' },
    { value: 'this_month', label: 'Este mês' },
    { value: 'next30', label: 'Próximos 30d' },
    { value: 'next60', label: 'Próximos 60d' },
]

export default function ReactivationFiltersPanel({ filters, onChange, currentUserId }: Props) {
    const [open, setOpen] = useState(false)
    const { destinations, responsaveis, lossReasons } = useReactivationFacets()

    const activeCount = [
        filters.destinations?.length,
        filters.ticketMin,
        filters.ticketMax,
        filters.daysSinceContact && filters.daysSinceContact !== 'any' ? 1 : 0,
        filters.lastTripRange && filters.lastTripRange !== 'any' ? 1 : 0,
        filters.birthdayWindow && filters.birthdayWindow !== 'any' ? 1 : 0,
        filters.lastLossReasonId,
        filters.responsavelId,
        filters.unassignedOnly ? 1 : 0,
        filters.excludeRecentInteraction ? 1 : 0,
    ].filter(Boolean).length

    function clearAll() {
        onChange({
            destinations: [],
            ticketMin: null,
            ticketMax: null,
            daysSinceContact: 'any',
            lastTripRange: 'any',
            birthdayWindow: 'any',
            lastLossReasonId: null,
            responsavelId: null,
            unassignedOnly: false,
            excludeRecentInteraction: false,
        })
    }

    function toggleDestination(d: string) {
        const cur = filters.destinations ?? []
        const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d]
        onChange({ destinations: next })
    }

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
            >
                <span className="flex items-center gap-2 font-medium">
                    Filtros avançados
                    {activeCount > 0 && (
                        <span className="inline-flex items-center justify-center bg-indigo-600 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1.5">
                            {activeCount}
                        </span>
                    )}
                </span>
                <span className="flex items-center gap-2 text-slate-400">
                    {activeCount > 0 && (
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); clearAll() }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); clearAll() } }}
                            className="text-xs text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                            Limpar
                        </span>
                    )}
                    {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
            </button>

            {open && (
                <div className="border-t border-slate-100 p-4 space-y-4">
                    <div>
                        <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Responsável</label>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => onChange({ responsavelId: null, unassignedOnly: false })}
                                className={cn(
                                    'px-2.5 py-1 rounded-lg text-xs ring-1',
                                    !filters.responsavelId && !filters.unassignedOnly
                                        ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                                        : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                                )}
                            >
                                Todos
                            </button>
                            {currentUserId && (
                                <button
                                    type="button"
                                    onClick={() => onChange({ responsavelId: currentUserId, unassignedOnly: false })}
                                    className={cn(
                                        'px-2.5 py-1 rounded-lg text-xs ring-1',
                                        filters.responsavelId === currentUserId
                                            ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                                            : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                                    )}
                                >
                                    Minha carteira
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => onChange({ unassignedOnly: !filters.unassignedOnly, responsavelId: null })}
                                className={cn(
                                    'px-2.5 py-1 rounded-lg text-xs ring-1',
                                    filters.unassignedOnly
                                        ? 'bg-rose-50 text-rose-700 ring-rose-200'
                                        : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                                )}
                            >
                                Sem responsável
                            </button>
                            <select
                                value={filters.responsavelId ?? ''}
                                onChange={e => onChange({ responsavelId: e.target.value || null, unassignedOnly: false })}
                                className="px-2.5 py-1 rounded-lg text-xs ring-1 ring-slate-200 bg-white text-slate-600"
                            >
                                <option value="">Escolher vendedor…</option>
                                {responsaveis.map(r => (
                                    <option key={r.id} value={r.id}>{r.nome ?? r.email ?? r.id}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Dias sem contato</label>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {DAYS_CONTACT.map(o => (
                                    <button key={o.value} type="button"
                                        onClick={() => onChange({ daysSinceContact: o.value })}
                                        className={cn('px-2 py-1 rounded-md text-[11px] ring-1',
                                            (filters.daysSinceContact ?? 'any') === o.value
                                                ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                                                : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50')}>
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Última viagem</label>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {LAST_TRIP.map(o => (
                                    <button key={o.value} type="button"
                                        onClick={() => onChange({ lastTripRange: o.value })}
                                        className={cn('px-2 py-1 rounded-md text-[11px] ring-1',
                                            (filters.lastTripRange ?? 'any') === o.value
                                                ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                                                : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50')}>
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Aniversariantes</label>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {BDAY.map(o => (
                                    <button key={o.value} type="button"
                                        onClick={() => onChange({ birthdayWindow: o.value })}
                                        className={cn('px-2 py-1 rounded-md text-[11px] ring-1',
                                            (filters.birthdayWindow ?? 'any') === o.value
                                                ? 'bg-pink-50 text-pink-700 ring-pink-200'
                                                : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50')}>
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Ticket médio (R$)</label>
                            <div className="mt-1.5 flex items-center gap-2">
                                <input
                                    type="number"
                                    placeholder="Mín"
                                    value={filters.ticketMin ?? ''}
                                    onChange={e => onChange({ ticketMin: e.target.value ? Number(e.target.value) : null })}
                                    className="w-28 px-2.5 py-1 rounded-lg ring-1 ring-slate-200 text-xs text-slate-600 bg-white"
                                />
                                <span className="text-slate-400 text-xs">até</span>
                                <input
                                    type="number"
                                    placeholder="Máx"
                                    value={filters.ticketMax ?? ''}
                                    onChange={e => onChange({ ticketMax: e.target.value ? Number(e.target.value) : null })}
                                    className="w-28 px-2.5 py-1 rounded-lg ring-1 ring-slate-200 text-xs text-slate-600 bg-white"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Motivo da última perda</label>
                            <select
                                value={filters.lastLossReasonId ?? ''}
                                onChange={e => onChange({ lastLossReasonId: e.target.value || null })}
                                className="mt-1.5 w-full px-2.5 py-1.5 rounded-lg ring-1 ring-slate-200 text-xs text-slate-600 bg-white"
                            >
                                <option value="">Qualquer</option>
                                {lossReasons.map(r => (
                                    <option key={r.id} value={r.id}>{r.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {destinations.length > 0 && (
                        <div>
                            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                                Destinos {(filters.destinations?.length ?? 0) > 0 && `(${filters.destinations?.length})`}
                            </label>
                            <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {destinations.slice(0, 80).map(d => {
                                    const on = filters.destinations?.includes(d) ?? false
                                    return (
                                        <button key={d} type="button"
                                            onClick={() => toggleDestination(d)}
                                            className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] ring-1',
                                                on ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50')}>
                                            {d}
                                            {on && <X className="w-3 h-3" />}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={filters.excludeRecentInteraction ?? false}
                            onChange={e => onChange({ excludeRecentInteraction: e.target.checked })}
                        />
                        Esconder quem já está em contato recente (&lt; 30d)
                    </label>
                </div>
            )}
        </div>
    )
}
