import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { PRIORIDADE_CONFIG } from './taskTypeConfig'
import type { TaskFilterState, TaskPrioridadeFilter } from '../../hooks/useTaskFilters'

const PRIORIDADE_OPTIONS: TaskPrioridadeFilter[] = ['alta', 'media', 'baixa']

const FASE_PRESETS: { slug: string; label: string }[] = [
    { slug: 'sdr', label: 'SDR' },
    { slug: 'planner', label: 'Planner' },
    { slug: 'pos-venda', label: 'Pós-venda' },
    { slug: 'concierge', label: 'Concierge' },
]

interface Props {
    open: boolean
    onClose: () => void
    filters: TaskFilterState
    setFilters: (partial: Partial<TaskFilterState>) => void
}

export function MoreTaskFiltersPopover({ open, onClose, filters, setFilters }: Props) {
    const { data: options } = useFilterOptions()
    const [personSearch, setPersonSearch] = useState('')
    const ref = useRef<HTMLDivElement>(null)

    const profiles = options?.profiles || []
    const filteredProfiles = personSearch
        ? profiles.filter(p =>
            (p.full_name || '').toLowerCase().includes(personSearch.toLowerCase()) ||
            (p.email || '').toLowerCase().includes(personSearch.toLowerCase()),
        )
        : profiles

    useEffect(() => {
        if (!open) return
        const handle = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose()
        }
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('mousedown', handle)
        document.addEventListener('keydown', esc)
        return () => {
            document.removeEventListener('mousedown', handle)
            document.removeEventListener('keydown', esc)
        }
    }, [open, onClose])

    if (!open) return null

    const togglePrioridade = (p: TaskPrioridadeFilter) => {
        const next = filters.prioridades.includes(p)
            ? filters.prioridades.filter(x => x !== p)
            : [...filters.prioridades, p]
        setFilters({ prioridades: next })
    }
    const toggleFase = (slug: string) => {
        const next = filters.fases.includes(slug)
            ? filters.fases.filter(x => x !== slug)
            : [...filters.fases, slug]
        setFilters({ fases: next })
    }
    const toggleResp = (id: string) => {
        const next = filters.responsavelIds.includes(id)
            ? filters.responsavelIds.filter(x => x !== id)
            : [...filters.responsavelIds, id]
        setFilters({ responsavelIds: next })
    }

    return (
        <div
            ref={ref}
            className="absolute right-0 top-full mt-2 w-[420px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-[70vh] overflow-y-auto"
        >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Mais filtros</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="p-4 space-y-5">
                <Section label="Prioridade">
                    <div className="flex gap-1.5 flex-wrap">
                        {PRIORIDADE_OPTIONS.map((p) => {
                            const cfg = PRIORIDADE_CONFIG[p]
                            const active = filters.prioridades.includes(p)
                            return (
                                <button
                                    key={p}
                                    onClick={() => togglePrioridade(p)}
                                    className={cn(
                                        'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all',
                                        active ? `${cfg.chip} ${cfg.chipText}` : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                                    )}
                                >
                                    <span className={cn('h-2 w-2 rounded-full', cfg.bar)} />
                                    {cfg.label}
                                </button>
                            )
                        })}
                    </div>
                </Section>

                <Section label="Fase do responsável">
                    <div className="flex gap-1.5 flex-wrap">
                        {FASE_PRESETS.map((f) => {
                            const active = filters.fases.includes(f.slug)
                            return (
                                <button
                                    key={f.slug}
                                    onClick={() => toggleFase(f.slug)}
                                    className={cn(
                                        'px-2 py-1 text-xs font-medium rounded-md border transition-all',
                                        active ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                                    )}
                                >
                                    {f.label}
                                </button>
                            )
                        })}
                    </div>
                </Section>

                <Section label="Pessoa responsável">
                    <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar pessoa..."
                            value={personSearch}
                            onChange={(e) => setPersonSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto">
                        {filteredProfiles.map((p) => {
                            const active = filters.responsavelIds.includes(p.id)
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => toggleResp(p.id)}
                                    className={cn(
                                        'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-all',
                                        active ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                                    )}
                                >
                                    <div className={cn(
                                        'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold flex-shrink-0',
                                        active ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-200 text-slate-600',
                                    )}>
                                        {(p.full_name || '?').charAt(0).toUpperCase()}
                                    </div>
                                    {(p.full_name || p.email || '').split(' ')[0]}
                                </button>
                            )
                        })}
                        {filteredProfiles.length === 0 && (
                            <span className="text-xs text-slate-400 px-1 py-2">Nenhuma pessoa encontrada</span>
                        )}
                    </div>
                </Section>

                <Section label="Período personalizado (vencimento)">
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={filters.dateFrom || ''}
                            onChange={(e) => setFilters({ dateFrom: e.target.value || undefined, deadlineFilter: 'all' })}
                            className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <span className="text-xs text-slate-400">até</span>
                        <input
                            type="date"
                            value={filters.dateTo || ''}
                            onChange={(e) => setFilters({ dateTo: e.target.value || undefined, deadlineFilter: 'all' })}
                            className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                    </div>
                </Section>
            </div>
        </div>
    )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{label}</label>
            {children}
        </div>
    )
}
