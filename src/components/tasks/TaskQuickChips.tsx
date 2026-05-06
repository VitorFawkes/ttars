import { cn } from '../../lib/utils'
import {
    TASK_TYPE_CONFIG,
    ORIGEM_CONFIG,
} from './taskTypeConfig'
import type {
    TaskFilterState,
    TaskDeadlineFilter,
    TaskStatusFilter,
    TaskOrigemFilter,
} from '../../hooks/useTaskFilters'

const STATUS_OPTIONS: { value: TaskStatusFilter; label: string }[] = [
    { value: 'pending', label: 'Pendentes' },
    { value: 'completed_today', label: 'Concluídas hoje' },
    { value: 'all', label: 'Todas' },
]

const DEADLINE_OPTIONS: { value: TaskDeadlineFilter; label: string; variant: string }[] = [
    { value: 'overdue', label: 'Atrasadas', variant: 'overdue' },
    { value: 'today', label: 'Hoje', variant: 'today' },
    { value: 'tomorrow', label: 'Amanhã', variant: 'future' },
    { value: 'this_week', label: 'Esta semana', variant: 'future' },
    { value: 'next_week', label: 'Próx. semana', variant: 'future' },
    { value: 'no_date', label: 'Sem prazo', variant: 'default' },
]

const TIPO_KEYS = ['tarefa', 'reuniao', 'contato', 'email', 'enviar_proposta', 'coleta_documentos', 'solicitacao_mudanca', 'envio_presente']
const ORIGEM_KEYS: TaskOrigemFilter[] = ['manual', 'cadencia', 'automacao', 'integracao']

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
            {/* Status segmentado */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Status:</span>
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                    {STATUS_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => setFilters({ statusFilter: opt.value })}
                            className={cn(
                                'px-2.5 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap',
                                filters.statusFilter === opt.value
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700',
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Prazo (single-select; clicar no ativo desliga) */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Prazo:</span>
                {DEADLINE_OPTIONS.map((opt) => {
                    const active = filters.deadlineFilter === opt.value
                    return (
                        <DeadlinePill
                            key={opt.value}
                            label={opt.label}
                            active={active}
                            variant={opt.variant}
                            onClick={() => setFilters({
                                deadlineFilter: active ? 'all' : opt.value,
                                dateFrom: undefined,
                                dateTo: undefined,
                            })}
                        />
                    )
                })}
            </div>

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

function DeadlinePill({
    label,
    active,
    variant,
    onClick,
}: {
    label: string
    active: boolean
    variant: string
    onClick: () => void
}) {
    const styles: Record<string, { base: string; active: string }> = {
        default: { base: 'border-slate-200 text-slate-600', active: 'bg-slate-100 border-slate-300 shadow-sm' },
        overdue: { base: 'border-red-200 text-red-700', active: 'bg-red-50 border-red-300 shadow-sm' },
        today: { base: 'border-blue-200 text-blue-700', active: 'bg-blue-50 border-blue-300 shadow-sm' },
        future: { base: 'border-emerald-200 text-emerald-700', active: 'bg-emerald-50 border-emerald-300 shadow-sm' },
    }
    const s = styles[variant] || styles.default
    return (
        <button
            onClick={onClick}
            className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-full border transition-all whitespace-nowrap',
                s.base,
                active ? s.active : 'bg-white hover:shadow-sm',
            )}
        >
            {label}
        </button>
    )
}
