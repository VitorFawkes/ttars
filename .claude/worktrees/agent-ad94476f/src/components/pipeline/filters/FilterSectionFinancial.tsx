import { DollarSign, Receipt, RefreshCw } from 'lucide-react'
import { FilterChipGroup } from './FilterChipGroup'
import { cn } from '../../../lib/utils'
import type { FilterState, ArrayFilterField } from '../../../hooks/usePipelineFilters'

const STATUS_TAXA_OPTIONS = [
    { value: 'paga', label: 'Paga', color: 'bg-green-500 text-white border-green-500' },
    { value: 'pendente', label: 'Pendente', color: 'bg-yellow-500 text-white border-yellow-500' },
    { value: 'cortesia', label: 'Cortesia', color: 'bg-blue-500 text-white border-blue-500' },
    { value: 'nao_aplicavel', label: 'N/A', color: 'bg-gray-500 text-white border-gray-500' },
    { value: 'nao_ativa', label: 'Não Ativa', color: 'bg-slate-500 text-white border-slate-500' },
]

interface FilterSectionFinancialProps {
    filters: FilterState
    onUpdate: (partial: Partial<FilterState>) => void
    onToggle: (field: ArrayFilterField, value: string) => void
}

export function FilterSectionFinancial({ filters, onUpdate, onToggle }: FilterSectionFinancialProps) {
    return (
        <>
            {/* Faixa de Valor */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <DollarSign className="h-3 w-3" /> Valores
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
                    <label className="text-sm font-semibold text-gray-700 block">Faixa de Valor</label>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <span className="text-xs text-gray-500 ml-1">Mínimo (R$)</span>
                            <input
                                type="number"
                                placeholder="0"
                                value={filters.valorMin ?? ''}
                                onChange={(e) => onUpdate({ valorMin: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-slate-50"
                            />
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-gray-500 ml-1">Máximo (R$)</span>
                            <input
                                type="number"
                                placeholder="∞"
                                value={filters.valorMax ?? ''}
                                onChange={(e) => onUpdate({ valorMax: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-slate-50"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Status da Taxa */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Receipt className="h-3 w-3" /> Taxa de Planejamento
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <FilterChipGroup
                        options={STATUS_TAXA_OPTIONS}
                        selected={filters.statusTaxa || []}
                        onToggle={(v) => onToggle('statusTaxa', v)}
                    />
                </div>
            </div>

            {/* Cliente Recorrente */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <RefreshCw className="h-3 w-3" /> Cliente Recorrente
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex gap-2">
                        {(['sim', 'nao'] as const).map(val => (
                            <button
                                key={val}
                                onClick={() => onUpdate({ clienteRecorrente: filters.clienteRecorrente === val ? undefined : val })}
                                className={cn(
                                    "px-4 py-1.5 text-xs font-medium rounded-lg border transition-all",
                                    filters.clienteRecorrente === val
                                        ? val === 'sim'
                                            ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                                            : "bg-slate-500 text-white border-slate-500 shadow-sm"
                                        : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                                )}
                            >
                                {val === 'sim' ? 'Sim' : 'Não'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </>
    )
}
