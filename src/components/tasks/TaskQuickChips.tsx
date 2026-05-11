import { cn } from '../../lib/utils'
import { Flame } from 'lucide-react'
import { TASK_TYPE_CONFIG, ORIGEM_CONFIG } from './taskTypeConfig'
import type {
    TaskFilterState,
    TaskEstado,
    TaskPrazo,
    TaskJanelaConclusao,
    TaskOrigemFilter,
} from '../../hooks/useTaskFilters'

const ESTADO_OPTIONS: { value: TaskEstado; label: string }[] = [
    { value: 'pendentes',   label: 'Pendentes' },
    { value: 'concluidas',  label: 'Concluídas' },
    { value: 'reagendadas', label: 'Reagendadas' },
    { value: 'canceladas',  label: 'Canceladas' },
    { value: 'tudo',        label: 'Tudo' },
]

const PRAZO_OPTIONS: { value: TaskPrazo; label: string; tone: 'rose' | 'amber' | 'blue' | 'emerald' | 'slate' }[] = [
    { value: 'atrasadas',      label: 'Atrasadas',      tone: 'rose' },
    { value: 'hoje',           label: 'Hoje',           tone: 'amber' },
    { value: 'amanha',         label: 'Amanhã',         tone: 'blue' },
    { value: 'esta_semana',    label: 'Esta semana',    tone: 'emerald' },
    { value: 'proxima_semana', label: 'Próx. semana',   tone: 'emerald' },
    { value: 'sem_prazo',      label: 'Sem prazo',      tone: 'slate' },
]

const JANELA_OPTIONS: { value: TaskJanelaConclusao; label: string }[] = [
    { value: 'hoje',        label: 'Hoje' },
    { value: 'ontem',       label: 'Ontem' },
    { value: 'esta_semana', label: 'Esta semana' },
    { value: 'este_mes',    label: 'Este mês' },
    { value: 'sempre',      label: 'Sempre' },
]

const TIPO_KEYS = ['tarefa', 'reuniao', 'contato', 'email', 'enviar_proposta', 'coleta_documentos', 'solicitacao_mudanca', 'envio_presente']
const ORIGEM_KEYS: TaskOrigemFilter[] = ['manual', 'cadencia', 'automacao', 'integracao']

const TONE_PILL: Record<string, { base: string; active: string }> = {
    rose:    { base: 'border-rose-200 text-rose-700',       active: 'bg-rose-50 border-rose-400 text-rose-900 shadow-sm' },
    amber:   { base: 'border-amber-200 text-amber-700',     active: 'bg-amber-50 border-amber-400 text-amber-900 shadow-sm' },
    blue:    { base: 'border-blue-200 text-blue-700',       active: 'bg-blue-50 border-blue-400 text-blue-900 shadow-sm' },
    emerald: { base: 'border-emerald-200 text-emerald-700', active: 'bg-emerald-50 border-emerald-400 text-emerald-900 shadow-sm' },
    slate:   { base: 'border-slate-200 text-slate-600',     active: 'bg-slate-100 border-slate-400 text-slate-900 shadow-sm' },
}

interface Props {
    filters: TaskFilterState
    setFilters: (partial: Partial<TaskFilterState>) => void
    onFocoHoje: () => void
}

export function TaskQuickChips({ filters, setFilters, onFocoHoje }: Props) {
    const showPrazos = filters.estado === 'pendentes' || filters.estado === 'tudo'
    const showJanela = filters.estado === 'concluidas'

    const focoHojeAtivo =
        filters.estado === 'pendentes' &&
        filters.prazos.length === 2 &&
        filters.prazos.includes('atrasadas') &&
        filters.prazos.includes('hoje')

    const togglePrazo = (p: TaskPrazo) => {
        const next = filters.prazos.includes(p)
            ? filters.prazos.filter(x => x !== p)
            : [...filters.prazos, p]
        setFilters({ prazos: next })
    }

    const toggleInList = <T extends string>(key: keyof TaskFilterState, value: T, list: T[]) => {
        const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value]
        setFilters({ [key]: next } as Partial<TaskFilterState>)
    }

    return (
        <div className="flex flex-col gap-2">
            {/* Linha 1: Estado (radio) + Foco hoje */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Estado:</span>
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                    {ESTADO_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => setFilters({ estado: opt.value })}
                            className={cn(
                                'px-2.5 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap',
                                filters.estado === opt.value
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700',
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <button
                    onClick={onFocoHoje}
                    className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border transition-all whitespace-nowrap',
                        focoHojeAtivo
                            ? 'bg-orange-100 border-orange-400 text-orange-900 shadow-sm'
                            : 'bg-white border-orange-200 text-orange-700 hover:bg-orange-50',
                    )}
                    title="Atalho: Pendentes + Atrasadas + Hoje"
                >
                    <Flame className="h-3.5 w-3.5" />
                    Foco hoje
                </button>
            </div>

            {/* Linha 2: Prazo (multi-select chips) — só pendentes/tudo */}
            {showPrazos && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Prazo:</span>
                    {PRAZO_OPTIONS.map((opt) => {
                        const active = filters.prazos.includes(opt.value)
                        const s = TONE_PILL[opt.tone]
                        return (
                            <button
                                key={opt.value}
                                onClick={() => togglePrazo(opt.value)}
                                className={cn(
                                    'px-2.5 py-0.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap',
                                    active ? s.active : `bg-white ${s.base} hover:shadow-sm`,
                                )}
                            >
                                {opt.label}
                            </button>
                        )
                    })}
                    {filters.prazos.length > 0 && (
                        <button
                            onClick={() => setFilters({ prazos: [] })}
                            className="text-[11px] text-slate-400 hover:text-slate-600 underline ml-1"
                        >
                            limpar
                        </button>
                    )}
                </div>
            )}

            {/* Linha 2 alt: Janela de conclusão (só concluidas) */}
            {showJanela && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Concluídas:</span>
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

            {/* Linha 3: Tipo */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tipo:</span>
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
                                'flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border transition-all',
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

            {/* Linha 4: Origem */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Origem:</span>
                {ORIGEM_KEYS.map((key) => {
                    const cfg = ORIGEM_CONFIG[key]
                    const active = filters.origens.includes(key)
                    return (
                        <button
                            key={key}
                            onClick={() => toggleInList('origens', key, filters.origens)}
                            className={cn(
                                'px-2 py-0.5 text-xs font-medium rounded-md border transition-all',
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
