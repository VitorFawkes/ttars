import { Clock, Plane } from 'lucide-react'
import type { FilterState } from '../../../hooks/usePipelineFilters'

interface FilterSectionUrgencyProps {
    filters: FilterState
    onUpdate: (partial: Partial<FilterState>) => void
}

const DIAS_SEM_CONTATO_PRESETS = [
    { label: '> 3 dias', value: 3 },
    { label: '> 7 dias', value: 7 },
    { label: '> 14 dias', value: 14 },
    { label: '> 30 dias', value: 30 },
]

const URGENCIA_VIAGEM_PRESETS = [
    { label: '< 7 dias', value: 7 },
    { label: '< 15 dias', value: 15 },
    { label: '< 30 dias', value: 30 },
    { label: '< 60 dias', value: 60 },
]

export function FilterSectionUrgency({ filters, onUpdate }: FilterSectionUrgencyProps) {
    return (
        <>
            {/* Dias Sem Contato */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Clock className="h-3 w-3" /> Dias Sem Contato
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-400 mb-3">Cards sem interação há mais de N dias</p>
                    <div className="flex flex-wrap gap-2">
                        {DIAS_SEM_CONTATO_PRESETS.map(preset => {
                            const isActive = filters.diasSemContato === preset.value
                            return (
                                <button
                                    key={preset.value}
                                    onClick={() => onUpdate({ diasSemContato: isActive ? undefined : preset.value })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                                        isActive
                                            ? 'bg-amber-100 text-amber-700 border-amber-300'
                                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    {preset.label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Urgência Viagem */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Plane className="h-3 w-3" /> Urgência Viagem
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-400 mb-3">Cards com viagem em até N dias</p>
                    <div className="flex flex-wrap gap-2">
                        {URGENCIA_VIAGEM_PRESETS.map(preset => {
                            const isActive = filters.diasAteViagem === preset.value
                            return (
                                <button
                                    key={preset.value}
                                    onClick={() => onUpdate({ diasAteViagem: isActive ? undefined : preset.value })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                                        isActive
                                            ? 'bg-orange-100 text-orange-700 border-orange-300'
                                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    {preset.label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        </>
    )
}
