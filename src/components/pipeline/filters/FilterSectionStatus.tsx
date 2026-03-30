import { Target, CheckSquare, Trophy } from 'lucide-react'
import { FilterChipGroup } from './FilterChipGroup'
import type { FilterState, ArrayFilterField } from '../../../hooks/usePipelineFilters'

const STATUS_COMERCIAL_OPTIONS = [
    { value: 'aberto', label: 'Em Aberto', color: 'bg-primary text-white border-primary' },
    { value: 'ganho', label: 'Ganho', color: 'bg-green-500 text-white border-green-500' },
    { value: 'perdido', label: 'Perdido', color: 'bg-red-500 text-white border-red-500' },
]

const TASK_STATUS_OPTIONS = [
    { value: 'atrasada', label: 'Atrasada', description: 'Tarefa vencida', color: 'bg-red-500 text-white border-red-500' },
    { value: 'para_hoje', label: 'Para Hoje', description: 'Vence hoje', color: 'bg-amber-500 text-white border-amber-500' },
    { value: 'em_dia', label: 'Em Dia', description: 'Vence no futuro', color: 'bg-emerald-500 text-white border-emerald-500' },
    { value: 'sem_tarefa', label: 'Sem Tarefa', description: 'Nenhuma tarefa pendente', color: 'bg-gray-500 text-white border-gray-500' },
]

const MILESTONE_OPTIONS = [
    { value: 'ganho_sdr', label: 'Ganho SDR', description: 'Qualificado pelo SDR', color: 'bg-blue-500 text-white border-blue-500' },
    { value: 'ganho_planner', label: 'Ganho Planner', description: 'Venda fechada', color: 'bg-purple-500 text-white border-purple-500' },
    { value: 'ganho_pos', label: 'Ganho Pós', description: 'Viagem concluída', color: 'bg-emerald-500 text-white border-emerald-500' },
]

interface FilterSectionStatusProps {
    filters: FilterState
    onToggle: (field: ArrayFilterField, value: string) => void
}

export function FilterSectionStatus({ filters, onToggle }: FilterSectionStatusProps) {
    return (
        <>
            {/* Status Comercial */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Target className="h-3 w-3" /> Status Comercial
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <FilterChipGroup
                        options={STATUS_COMERCIAL_OPTIONS}
                        selected={filters.statusComercial || []}
                        onToggle={(v) => onToggle('statusComercial', v)}
                    />
                </div>
            </div>

            {/* Tarefas */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <CheckSquare className="h-3 w-3" /> Tarefas
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-400 mb-3">Filtra cards pelo status da tarefa mais proxima</p>
                    <FilterChipGroup
                        options={TASK_STATUS_OPTIONS}
                        selected={filters.taskStatus || []}
                        onToggle={(v) => onToggle('taskStatus', v)}
                    />
                </div>
            </div>

            {/* Marcos do Funil */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Trophy className="h-3 w-3" /> Marcos do Funil
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-400 mb-3">Filtra cards que alcançaram estes marcos, independente do status atual</p>
                    <FilterChipGroup
                        options={MILESTONE_OPTIONS}
                        selected={filters.milestones || []}
                        onToggle={(v) => onToggle('milestones', v)}
                    />
                </div>
            </div>
        </>
    )
}
