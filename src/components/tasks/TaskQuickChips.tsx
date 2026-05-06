import { cn } from '../../lib/utils'
import {
    AlertTriangle, Clock, Calendar, CalendarDays, CheckCircle2, RotateCcw, Ban, Globe,
} from 'lucide-react'
import {
    TASK_TYPE_CONFIG,
    ORIGEM_CONFIG,
} from './taskTypeConfig'
import type {
    TaskFilterState,
    TaskSituacao,
    TaskJanelaConclusao,
    TaskOrigemFilter,
} from '../../hooks/useTaskFilters'

const SITUACAO_OPTIONS: {
    value: TaskSituacao
    label: string
    icon: typeof Clock
    tone: 'neutral' | 'rose' | 'blue' | 'emerald' | 'amber' | 'slate'
}[] = [
    { value: 'abertas',     label: 'Abertas',          icon: Clock,         tone: 'blue' },
    { value: 'atrasadas',   label: 'Atrasadas',        icon: AlertTriangle, tone: 'rose' },
    { value: 'hoje',        label: 'Hoje',             icon: Calendar,      tone: 'amber' },
    { value: 'esta_semana', label: 'Esta semana',      icon: CalendarDays,  tone: 'emerald' },
    { value: 'concluidas',  label: 'Concluídas',       icon: CheckCircle2,  tone: 'emerald' },
    { value: 'reagendadas', label: 'Reagendadas',      icon: RotateCcw,     tone: 'slate' },
    { value: 'canceladas',  label: 'Canceladas',       icon: Ban,           tone: 'slate' },
    { value: 'tudo',        label: 'Tudo',             icon: Globe,         tone: 'neutral' },
]

const JANELA_OPTIONS: { value: TaskJanelaConclusao; label: string }[] = [
    { value: 'hoje', label: 'Hoje' },
    { value: 'ontem', label: 'Ontem' },
    { value: 'esta_semana', label: 'Esta semana' },
    { value: 'este_mes', label: 'Este mês' },
    { value: 'sempre', label: 'Sempre' },
]

const TIPO_KEYS = ['tarefa', 'reuniao', 'contato', 'email', 'enviar_proposta', 'coleta_documentos', 'solicitacao_mudanca', 'envio_presente']
const ORIGEM_KEYS: TaskOrigemFilter[] = ['manual', 'cadencia', 'automacao', 'integracao']

const TONE_STYLES: Record<string, { base: string; active: string; icon: string }> = {
    neutral: { base: 'border-slate-200 text-slate-600', active: 'bg-slate-100 border-slate-300 text-slate-900', icon: 'text-slate-500' },
    blue:    { base: 'border-blue-200 text-blue-700',    active: 'bg-blue-50 border-blue-300 text-blue-900',    icon: 'text-blue-600' },
    rose:    { base: 'border-rose-200 text-rose-700',    active: 'bg-rose-50 border-rose-300 text-rose-900',    icon: 'text-rose-600' },
    emerald: { base: 'border-emerald-200 text-emerald-700', active: 'bg-emerald-50 border-emerald-300 text-emerald-900', icon: 'text-emerald-600' },
    amber:   { base: 'border-amber-200 text-amber-700',  active: 'bg-amber-50 border-amber-300 text-amber-900', icon: 'text-amber-600' },
    slate:   { base: 'border-slate-200 text-slate-600',  active: 'bg-slate-100 border-slate-300 text-slate-900', icon: 'text-slate-500' },
}

interface Props {
    filters: TaskFilterState
    setFilters: (partial: Partial<TaskFilterState>) => void
}

export function TaskQuickChips({ filters, setFilters }: Props) {
    const toggleInList = <T extends string>(key: keyof TaskFilterState, value: T, list: T[]) => {
        const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value]
        setFilters({ [key]: next } as Partial<TaskFilterState>)
    }

    return (
        <div className="flex flex-col gap-2">
            {/* Situação principal */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Situação:</span>
                {SITUACAO_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    const active = filters.situacao === opt.value
                    const s = TONE_STYLES[opt.tone]
                    return (
                        <button
                            key={opt.value}
                            onClick={() => setFilters({ situacao: opt.value })}
                            className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all whitespace-nowrap',
                                active ? s.active : `bg-white ${s.base} hover:shadow-sm`,
                            )}
                        >
                            <Icon className={cn('h-3.5 w-3.5', active ? s.icon : 'text-slate-400')} />
                            {opt.label}
                        </button>
                    )
                })}
            </div>

            {/* Janela de conclusão (só aparece quando situacao=concluidas) */}
            {filters.situacao === 'concluidas' && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Concluídas:</span>
                    {JANELA_OPTIONS.map((opt) => {
                        const active = filters.janelaConclusao === opt.value
                        return (
                            <button
                                key={opt.value}
                                onClick={() => setFilters({ janelaConclusao: opt.value })}
                                className={cn(
                                    'px-2 py-0.5 text-xs font-medium rounded-md border transition-all whitespace-nowrap',
                                    active
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                                )}
                            >
                                {opt.label}
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Tipo */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Tipo:</span>
                {TIPO_KEYS.map((key) => {
                    const cfg = TASK_TYPE_CONFIG[key]
                    if (!cfg) return null
                    const Icon = cfg.icon
                    const active = filters.tipos.includes(key)
                    return (
                        <button
                            key={key}
                            onClick={() => toggleInList('tipos', key, filters.tipos)}
                            className={cn(
                                'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-all',
                                active
                                    ? `${cfg.bg} ${cfg.color} border-current/20`
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                            )}
                        >
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                        </button>
                    )
                })}
            </div>

            {/* Origem */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Origem:</span>
                {ORIGEM_KEYS.map((key) => {
                    const cfg = ORIGEM_CONFIG[key]
                    const active = filters.origens.includes(key)
                    return (
                        <button
                            key={key}
                            onClick={() => toggleInList('origens', key, filters.origens)}
                            className={cn(
                                'px-2 py-1 text-xs font-medium rounded-md border transition-all',
                                active ? cfg.chip : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                            )}
                        >
                            {cfg.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
