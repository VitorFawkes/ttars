import { useState } from 'react'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { FilterState } from '../../../hooks/usePipelineFilters'

interface FilterSectionSmartFieldsProps {
    filters: FilterState
    onUpdate: (partial: Partial<FilterState>) => void
}

interface FieldCategory {
    label: string
    fields: { value: string; label: string }[]
}

const FIELD_CATEGORIES: FieldCategory[] = [
    {
        label: 'Contato',
        fields: [
            { value: 'pessoa_email', label: 'Email' },
            { value: 'pessoa_telefone', label: 'Telefone' },
        ],
    },
    {
        label: 'Valores',
        fields: [
            { value: 'valor_estimado', label: 'Valor Estimado' },
            { value: 'valor_final', label: 'Valor Final' },
            { value: 'forma_pagamento', label: 'Forma de Pagamento' },
            { value: 'condicoes_pagamento', label: 'Cond. Pagamento' },
        ],
    },
    {
        label: 'Datas',
        fields: [
            { value: 'data_viagem_inicio', label: 'Data da Viagem' },
            { value: 'data_fechamento', label: 'Data de Fechamento' },
        ],
    },
    {
        label: 'Integrações',
        fields: [
            { value: 'external_id', label: 'ID ActiveCampaign' },
            { value: 'numero_venda_monde', label: 'N° Venda Monde' },
        ],
    },
    {
        label: 'Outros',
        fields: [
            { value: 'destinos', label: 'Destinos' },
            { value: 'origem', label: 'Origem' },
            { value: 'dono_atual_id', label: 'Responsável' },
        ],
    },
]

type FieldStatus = 'filled' | 'empty' | null

export function FilterSectionSmartFields({ filters, onUpdate }: FilterSectionSmartFieldsProps) {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Contato', 'Valores']))

    const getFieldStatus = (field: string): FieldStatus => {
        if (filters.filledFields?.includes(field)) return 'filled'
        if (filters.emptyFields?.includes(field)) return 'empty'
        return null
    }

    const toggleFieldStatus = (field: string, status: 'filled' | 'empty') => {
        const currentStatus = getFieldStatus(field)
        const filled = (filters.filledFields || []).filter(f => f !== field)
        const empty = (filters.emptyFields || []).filter(f => f !== field)

        if (currentStatus !== status) {
            if (status === 'filled') filled.push(field)
            else empty.push(field)
        }

        onUpdate({
            filledFields: filled.length ? filled : undefined,
            emptyFields: empty.length ? empty : undefined,
        })
    }

    const toggleCategory = (label: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev)
            if (next.has(label)) next.delete(label)
            else next.add(label)
            return next
        })
    }

    const activeCount = (filters.filledFields?.length ?? 0) + (filters.emptyFields?.length ?? 0)

    return (
        <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Search className="h-3 w-3" /> Preenchimento de Campos
                {activeCount > 0 && (
                    <span className="ml-auto bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {activeCount}
                    </span>
                )}
            </h3>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <p className="text-xs text-gray-400 px-4 pt-3 pb-2">Filtre cards com campos preenchidos ou vazios</p>
                {FIELD_CATEGORIES.map(category => {
                    const isExpanded = expandedCategories.has(category.label)
                    const categoryActiveCount = category.fields.filter(f => getFieldStatus(f.value) !== null).length

                    return (
                        <div key={category.label} className="border-t border-gray-50">
                            <button
                                onClick={() => toggleCategory(category.label)}
                                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {isExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                    ) : (
                                        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                                    )}
                                    <span className="text-sm font-medium text-gray-700">{category.label}</span>
                                    {categoryActiveCount > 0 && (
                                        <span className="bg-indigo-100 text-indigo-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                            {categoryActiveCount}
                                        </span>
                                    )}
                                </div>
                                <span className="text-[10px] text-gray-400">{category.fields.length} campos</span>
                            </button>
                            {isExpanded && (
                                <div className="px-4 pb-3 space-y-1">
                                    {category.fields.map(field => {
                                        const status = getFieldStatus(field.value)
                                        return (
                                            <div key={field.value} className="flex items-center justify-between py-1.5">
                                                <span className="text-sm text-gray-600">{field.label}</span>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => toggleFieldStatus(field.value, 'filled')}
                                                        className={cn(
                                                            "px-2.5 py-1 text-xs font-medium rounded-md border transition-all",
                                                            status === 'filled'
                                                                ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                                                                : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50 hover:text-gray-600"
                                                        )}
                                                    >
                                                        Preenchido
                                                    </button>
                                                    <button
                                                        onClick={() => toggleFieldStatus(field.value, 'empty')}
                                                        className={cn(
                                                            "px-2.5 py-1 text-xs font-medium rounded-md border transition-all",
                                                            status === 'empty'
                                                                ? "bg-red-500 text-white border-red-500 shadow-sm"
                                                                : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50 hover:text-gray-600"
                                                        )}
                                                    >
                                                        Vazio
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
