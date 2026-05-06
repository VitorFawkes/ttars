import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { TASK_TYPE_CONFIG, ORIGEM_CONFIG, PRIORIDADE_CONFIG } from './taskTypeConfig'
import type { TaskFilterState } from '../../hooks/useTaskFilters'

const FASE_LABELS: Record<string, string> = {
    sdr: 'SDR',
    planner: 'Planner',
    'pos-venda': 'Pós-venda',
    concierge: 'Concierge',
}

interface Props {
    filters: TaskFilterState
    setFilters: (partial: Partial<TaskFilterState>) => void
    onReset: () => void
}

export function ActiveTaskFilters({ filters, setFilters, onReset }: Props) {
    const { data: options } = useFilterOptions()
    const profiles = options?.profiles || []

    const chips: { key: string; label: string; tone: 'blue' | 'green' | 'amber' | 'rose'; onRemove: () => void }[] = []

    if (filters.search) {
        chips.push({
            key: 'search',
            label: `“${filters.search}”`,
            tone: 'blue',
            onRemove: () => setFilters({ search: '' }),
        })
    }

    if (filters.statusFilter !== 'pending') {
        const labels: Record<string, string> = {
            completed_today: 'Concluídas hoje',
            all: 'Todos os status',
        }
        chips.push({
            key: 'status',
            label: labels[filters.statusFilter] || filters.statusFilter,
            tone: 'green',
            onRemove: () => setFilters({ statusFilter: 'pending' }),
        })
    }

    if (filters.scope !== 'minhas') {
        const labels: Record<string, string> = {
            meu_time: 'Meu time',
            todas: 'Todas',
        }
        chips.push({
            key: 'scope',
            label: labels[filters.scope] || filters.scope,
            tone: 'blue',
            onRemove: () => setFilters({ scope: 'minhas' }),
        })
    }

    if (filters.deadlineFilter !== 'all') {
        const labels: Record<string, string> = {
            overdue: 'Atrasadas',
            today: 'Hoje',
            tomorrow: 'Amanhã',
            this_week: 'Esta semana',
            next_week: 'Próx. semana',
            no_date: 'Sem prazo',
        }
        chips.push({
            key: 'deadline',
            label: labels[filters.deadlineFilter] || filters.deadlineFilter,
            tone: filters.deadlineFilter === 'overdue' ? 'rose' : 'amber',
            onRemove: () => setFilters({ deadlineFilter: 'all' }),
        })
    }

    filters.tipos.forEach((tipo) => {
        const cfg = TASK_TYPE_CONFIG[tipo]
        chips.push({
            key: `tipo:${tipo}`,
            label: `Tipo: ${cfg?.label || tipo}`,
            tone: 'blue',
            onRemove: () => setFilters({ tipos: filters.tipos.filter(t => t !== tipo) }),
        })
    })

    filters.prioridades.forEach((p) => {
        const cfg = PRIORIDADE_CONFIG[p]
        chips.push({
            key: `prio:${p}`,
            label: `Prioridade: ${cfg?.label || p}`,
            tone: p === 'alta' ? 'rose' : 'amber',
            onRemove: () => setFilters({ prioridades: filters.prioridades.filter(x => x !== p) }),
        })
    })

    filters.origens.forEach((o) => {
        const cfg = ORIGEM_CONFIG[o]
        chips.push({
            key: `origem:${o}`,
            label: `Origem: ${cfg?.label || o}`,
            tone: 'blue',
            onRemove: () => setFilters({ origens: filters.origens.filter(x => x !== o) }),
        })
    })

    filters.fases.forEach((slug) => {
        chips.push({
            key: `fase:${slug}`,
            label: `Fase: ${FASE_LABELS[slug] || slug}`,
            tone: 'blue',
            onRemove: () => setFilters({ fases: filters.fases.filter(x => x !== slug) }),
        })
    })

    filters.responsavelIds.forEach((id) => {
        const profile = profiles.find(p => p.id === id)
        const name = profile?.full_name || profile?.email || id.slice(0, 6)
        chips.push({
            key: `quem:${id}`,
            label: `Pessoa: ${name}`,
            tone: 'blue',
            onRemove: () => setFilters({ responsavelIds: filters.responsavelIds.filter(x => x !== id) }),
        })
    })

    if (filters.dateFrom || filters.dateTo) {
        const from = filters.dateFrom ? formatDateBr(filters.dateFrom) : '...'
        const to = filters.dateTo ? formatDateBr(filters.dateTo) : '...'
        chips.push({
            key: 'period',
            label: `Período: ${from} → ${to}`,
            tone: 'amber',
            onRemove: () => setFilters({ dateFrom: undefined, dateTo: undefined }),
        })
    }

    if (chips.length === 0) return null

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {chips.map(c => (
                <Chip key={c.key} tone={c.tone} onRemove={c.onRemove}>
                    {c.label}
                </Chip>
            ))}
            <button
                onClick={onReset}
                className="text-xs text-slate-500 hover:text-slate-700 underline ml-1"
            >
                Limpar tudo
            </button>
        </div>
    )
}

function Chip({
    children,
    tone,
    onRemove,
}: {
    children: React.ReactNode
    tone: 'blue' | 'green' | 'amber' | 'rose'
    onRemove: () => void
}) {
    const tones: Record<string, string> = {
        blue: 'bg-indigo-50 border-indigo-200 text-indigo-700',
        green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        amber: 'bg-amber-50 border-amber-200 text-amber-700',
        rose: 'bg-rose-50 border-rose-200 text-rose-700',
    }
    return (
        <span className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border',
            tones[tone],
        )}>
            {children}
            <button
                onClick={onRemove}
                className="opacity-60 hover:opacity-100"
                aria-label="Remover filtro"
            >
                <X className="h-3 w-3" />
            </button>
        </span>
    )
}

function formatDateBr(iso: string): string {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y.slice(2)}`
}
