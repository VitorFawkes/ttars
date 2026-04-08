import { Search, Calendar, AlertTriangle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { FilterChipGroup } from './FilterChipGroup'
import type { FilterState, ArrayFilterField } from '../../../hooks/usePipelineFilters'

interface FilterSectionSmartFieldsProps {
    filters: FilterState
    onUpdate: (partial: Partial<FilterState>) => void
    onToggle: (field: ArrayFilterField, value: string) => void
}

/**
 * Campos disponíveis para filtro vazio/preenchido.
 * column = nome na view_cards_acoes
 */
const SMART_FIELD_OPTIONS: { value: string; label: string; group: string }[] = [
    { value: 'data_viagem_inicio', label: 'Data da Viagem', group: 'datas' },
    { value: 'data_fechamento', label: 'Data de Fechamento', group: 'datas' },
    { value: 'valor_estimado', label: 'Valor Estimado', group: 'valores' },
    { value: 'valor_final', label: 'Valor Final', group: 'valores' },
    { value: 'pessoa_email', label: 'Email do Contato', group: 'contato' },
    { value: 'pessoa_telefone', label: 'Telefone do Contato', group: 'contato' },
    { value: 'origem', label: 'Origem', group: 'card' },
    { value: 'dono_atual_id', label: 'Responsável', group: 'card' },
    { value: 'destinos', label: 'Destinos', group: 'card' },
    { value: 'condicoes_pagamento', label: 'Cond. Pagamento', group: 'valores' },
]

type FieldStatus = 'filled' | 'empty' | null

const PRIORIDADE_OPTIONS = [
    { value: 'alta', label: 'Alta', color: 'bg-red-500 text-white border-red-500' },
    { value: 'media', label: 'Média', color: 'bg-yellow-500 text-white border-yellow-500' },
    { value: 'baixa', label: 'Baixa', color: 'bg-green-500 text-white border-green-500' },
]

export function FilterSectionSmartFields({ filters, onUpdate, onToggle }: FilterSectionSmartFieldsProps) {
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

    return (
        <>
            {/* Preenchimento de Campos */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Search className="h-3 w-3" /> Preenchimento de Campos
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-400 mb-3">Filtre cards com campos preenchidos ou vazios</p>
                    <div className="space-y-2">
                        {SMART_FIELD_OPTIONS.map(field => {
                            const status = getFieldStatus(field.value)
                            return (
                                <div key={field.value} className="flex items-center justify-between py-1.5">
                                    <span className="text-sm text-gray-700">{field.label}</span>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => toggleFieldStatus(field.value, 'filled')}
                                            className={cn(
                                                "px-2.5 py-1 text-xs font-medium rounded-md border transition-all",
                                                status === 'filled'
                                                    ? "bg-emerald-100 text-emerald-700 border-emerald-300"
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
                                                    ? "bg-red-100 text-red-700 border-red-300"
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
                </div>
            </div>

            {/* Data de Fechamento */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Calendar className="h-3 w-3" /> Data de Fechamento
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <span className="text-xs text-gray-500 ml-1">De</span>
                            <input
                                type="date"
                                className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                value={filters.closingStartDate || ''}
                                onChange={(e) => onUpdate({ closingStartDate: e.target.value || undefined })}
                            />
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-gray-500 ml-1">Até</span>
                            <input
                                type="date"
                                className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                value={filters.closingEndDate || ''}
                                onChange={(e) => onUpdate({ closingEndDate: e.target.value || undefined })}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Prioridade */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3" /> Prioridade
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <FilterChipGroup
                        options={PRIORIDADE_OPTIONS}
                        selected={filters.prioridade || []}
                        onToggle={(v) => onToggle('prioridade', v)}
                    />
                </div>
            </div>
        </>
    )
}
