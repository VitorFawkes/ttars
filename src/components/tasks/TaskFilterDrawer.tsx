import { useEffect, useState } from 'react'
import { ChevronDown, Search, X, Calendar, AlertOctagon, Users, MapPin, FileSearch2, Award } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { useTaskOutcomes } from '../../hooks/useTaskOutcomes'
import { PRIORIDADE_CONFIG, OUTCOME_LABELS } from './taskTypeConfig'
import type { TaskFilterState, TaskPrioridadeFilter, TaskUrgenciaFilter } from '../../hooks/useTaskFilters'

const PRIORIDADE_OPTIONS: TaskPrioridadeFilter[] = ['alta', 'media', 'baixa']

const FASE_RESPONSAVEL_PRESETS: { slug: string; label: string }[] = [
    { slug: 'sdr', label: 'SDR' },
    { slug: 'planner', label: 'Planner' },
    { slug: 'pos-venda', label: 'Pós-venda' },
    { slug: 'concierge', label: 'Concierge' },
]

const CARD_FASE_PRESETS: { slug: string; label: string }[] = [
    { slug: 'sdr', label: 'SDR (lead)' },
    { slug: 'planner', label: 'Planner (em montagem)' },
    { slug: 'pos-venda', label: 'Pós-venda' },
    { slug: 'resolucao', label: 'Resolução' },
]

const STATUS_COMERCIAL_PRESETS: { value: string; label: string; tone: string }[] = [
    { value: 'aberto', label: 'Em aberto', tone: 'blue' },
    { value: 'ganho', label: 'Ganho', tone: 'emerald' },
    { value: 'perdido', label: 'Perdido', tone: 'rose' },
    { value: 'sem_pos_venda', label: 'Sem pós-venda', tone: 'slate' },
]

const URGENCIA_PRESETS: { value: TaskUrgenciaFilter; label: string }[] = [
    { value: 'sem_responsavel', label: 'Sem responsável' },
    { value: 'sem_prazo', label: 'Sem prazo' },
    { value: 'sem_descricao', label: 'Sem descrição' },
    { value: 'sem_resultado', label: 'Concluída sem resultado registrado' },
]

const ATRASO_PRESETS: number[] = [3, 7, 14, 30]

type SectionKey = 'datas' | 'urgencia' | 'pessoas' | 'estado_viagem' | 'campos_vazios' | 'resultado'

const SECTIONS: { key: SectionKey; label: string; icon: typeof Calendar }[] = [
    { key: 'datas', label: 'Datas', icon: Calendar },
    { key: 'urgencia', label: 'Urgência', icon: AlertOctagon },
    { key: 'pessoas', label: 'Pessoas & Prioridade', icon: Users },
    { key: 'estado_viagem', label: 'Estado da viagem', icon: MapPin },
    { key: 'campos_vazios', label: 'Campos vazios', icon: FileSearch2 },
    { key: 'resultado', label: 'Resultado da tarefa', icon: Award },
]

interface Props {
    open: boolean
    onClose: () => void
    filters: TaskFilterState
    setFilters: (partial: Partial<TaskFilterState>) => void
}

export function TaskFilterDrawer({ open, onClose, filters, setFilters }: Props) {
    const { data: options } = useFilterOptions()
    const { data: outcomeOptions } = useTaskOutcomes()
    const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(['datas', 'urgencia']))
    const [personSearch, setPersonSearch] = useState('')

    const profiles = options?.profiles || []
    const filteredProfiles = personSearch
        ? profiles.filter(p =>
            (p.full_name || '').toLowerCase().includes(personSearch.toLowerCase()) ||
            (p.email || '').toLowerCase().includes(personSearch.toLowerCase()),
        )
        : profiles

    useEffect(() => {
        if (!open) return
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', esc)
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', esc)
            document.body.style.overflow = ''
        }
    }, [open, onClose])

    if (!open) return null

    const toggleSection = (key: SectionKey) => {
        setOpenSections(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const togglePrioridade = (p: TaskPrioridadeFilter) => {
        const next = filters.prioridades.includes(p)
            ? filters.prioridades.filter(x => x !== p)
            : [...filters.prioridades, p]
        setFilters({ prioridades: next })
    }

    const toggleStringList = (key: keyof TaskFilterState, value: string) => {
        const list = (filters[key] as string[]) || []
        const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value]
        setFilters({ [key]: next } as Partial<TaskFilterState>)
    }

    // task_type_outcomes tem (tipo, outcome_key, outcome_label) — dedupe por outcome_key
    const distinctOutcomes: string[] = Array.from(new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (outcomeOptions || []).map((o: any) => o.outcome_key).filter(Boolean),
    ))
    const allOutcomes = distinctOutcomes.length > 0 ? distinctOutcomes : Object.keys(OUTCOME_LABELS)

    return (
        <>
            <div
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
                onClick={onClose}
            />
            <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col">
                <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
                    <h2 className="text-base font-semibold text-slate-900">Mais filtros</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto">
                    {SECTIONS.map(({ key, label, icon: Icon }) => {
                        const isOpen = openSections.has(key)
                        return (
                            <div key={key} className="border-b border-slate-100">
                                <button
                                    onClick={() => toggleSection(key)}
                                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 text-left"
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon className="h-4 w-4 text-slate-500" />
                                        <span className="text-sm font-medium text-slate-900">{label}</span>
                                    </div>
                                    <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
                                </button>

                                {isOpen && (
                                    <div className="px-5 pb-4 space-y-3">
                                        {key === 'datas' && (
                                            <>
                                                <DateRangeRow
                                                    label="Vencimento"
                                                    from={filters.vencimentoFrom}
                                                    to={filters.vencimentoTo}
                                                    onChange={(from, to) => setFilters({ vencimentoFrom: from, vencimentoTo: to })}
                                                />
                                                <DateRangeRow
                                                    label="Criação"
                                                    from={filters.criacaoFrom}
                                                    to={filters.criacaoTo}
                                                    onChange={(from, to) => setFilters({ criacaoFrom: from, criacaoTo: to })}
                                                />
                                                <DateRangeRow
                                                    label="Conclusão (sobrescreve janela)"
                                                    from={filters.conclusaoFrom}
                                                    to={filters.conclusaoTo}
                                                    onChange={(from, to) => setFilters({ conclusaoFrom: from, conclusaoTo: to })}
                                                />
                                            </>
                                        )}

                                        {key === 'urgencia' && (
                                            <>
                                                <div>
                                                    <Label>Atrasada há mais de</Label>
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {ATRASO_PRESETS.map((d) => {
                                                            const active = filters.atrasadaMaisDias === d
                                                            return (
                                                                <button
                                                                    key={d}
                                                                    onClick={() => setFilters({ atrasadaMaisDias: active ? undefined : d })}
                                                                    className={cn(
                                                                        'px-2.5 py-1 text-xs font-medium rounded-md border transition-all',
                                                                        active
                                                                            ? 'bg-rose-50 border-rose-300 text-rose-800'
                                                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                                                                    )}
                                                                >
                                                                    {d} dias
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {key === 'pessoas' && (
                                            <>
                                                <div>
                                                    <Label>Prioridade</Label>
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
                                                </div>

                                                <div>
                                                    <Label>Fase do responsável</Label>
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {FASE_RESPONSAVEL_PRESETS.map((f) => {
                                                            const active = filters.fases.includes(f.slug)
                                                            return (
                                                                <button
                                                                    key={f.slug}
                                                                    onClick={() => toggleStringList('fases', f.slug)}
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
                                                </div>

                                                <div>
                                                    <Label>Pessoa responsável</Label>
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
                                                                    onClick={() => toggleStringList('responsavelIds', p.id)}
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
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {key === 'estado_viagem' && (
                                            <>
                                                <div>
                                                    <Label>Status comercial da viagem</Label>
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {STATUS_COMERCIAL_PRESETS.map((s) => {
                                                            const active = filters.cardStatusComercial.includes(s.value)
                                                            const tones: Record<string, string> = {
                                                                blue: 'bg-blue-50 border-blue-300 text-blue-800',
                                                                emerald: 'bg-emerald-50 border-emerald-300 text-emerald-800',
                                                                rose: 'bg-rose-50 border-rose-300 text-rose-800',
                                                                slate: 'bg-slate-100 border-slate-300 text-slate-700',
                                                            }
                                                            return (
                                                                <button
                                                                    key={s.value}
                                                                    onClick={() => toggleStringList('cardStatusComercial', s.value)}
                                                                    className={cn(
                                                                        'px-2 py-1 text-xs font-medium rounded-md border transition-all',
                                                                        active ? tones[s.tone] : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                                                                    )}
                                                                >
                                                                    {s.label}
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                </div>

                                                <div>
                                                    <Label>Fase da viagem no funil</Label>
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {CARD_FASE_PRESETS.map((f) => {
                                                            const active = filters.cardFases.includes(f.slug)
                                                            return (
                                                                <button
                                                                    key={f.slug}
                                                                    onClick={() => toggleStringList('cardFases', f.slug)}
                                                                    className={cn(
                                                                        'px-2 py-1 text-xs font-medium rounded-md border transition-all',
                                                                        active ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                                                                    )}
                                                                >
                                                                    {f.label}
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {key === 'campos_vazios' && (
                                            <div>
                                                <Label>Mostrar tarefas com:</Label>
                                                <div className="flex flex-col gap-1.5">
                                                    {URGENCIA_PRESETS.map((u) => {
                                                        const active = filters.urgencia.includes(u.value)
                                                        return (
                                                            <button
                                                                key={u.value}
                                                                onClick={() => toggleStringList('urgencia', u.value)}
                                                                className={cn(
                                                                    'flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-all w-full',
                                                                    active ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                                                                )}
                                                            >
                                                                <span>{u.label}</span>
                                                                {active && <span className="text-[10px] uppercase tracking-wider">Ativo</span>}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {key === 'resultado' && (
                                            <div>
                                                <Label>Resultado registrado (para concluídas)</Label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {allOutcomes.map((o) => {
                                                        const active = filters.resultados.includes(o)
                                                        const label = OUTCOME_LABELS[o] || o
                                                        return (
                                                            <button
                                                                key={o}
                                                                onClick={() => toggleStringList('resultados', o)}
                                                                className={cn(
                                                                    'px-2 py-1 text-xs font-medium rounded-md border transition-all',
                                                                    active ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                                                                )}
                                                            >
                                                                {label}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                <footer className="flex items-center justify-between px-5 py-3 border-t border-slate-200 flex-shrink-0 bg-slate-50">
                    <span className="text-xs text-slate-500">As mudanças aplicam na hora.</span>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                        Fechar
                    </button>
                </footer>
            </aside>
        </>
    )
}

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{children}</label>
}

function DateRangeRow({
    label,
    from,
    to,
    onChange,
}: {
    label: string
    from?: string
    to?: string
    onChange: (from: string | undefined, to: string | undefined) => void
}) {
    return (
        <div>
            <Label>{label}</Label>
            <div className="flex items-center gap-2">
                <input
                    type="date"
                    value={from || ''}
                    onChange={(e) => onChange(e.target.value || undefined, to)}
                    className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <span className="text-xs text-slate-400">até</span>
                <input
                    type="date"
                    value={to || ''}
                    onChange={(e) => onChange(from, e.target.value || undefined)}
                    className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                {(from || to) && (
                    <button
                        onClick={() => onChange(undefined, undefined)}
                        className="text-slate-400 hover:text-slate-600"
                        title="Limpar"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
        </div>
    )
}
