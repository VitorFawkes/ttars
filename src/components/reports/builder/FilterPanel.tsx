import { useState } from 'react'
import { Plus, X, Filter } from 'lucide-react'
import type { FilterSpec, FilterOperator, FieldDefinition } from '@/lib/reports/reportTypes'

const OPERATOR_LABELS: Record<FilterOperator, string> = {
    eq: 'Igual a',
    neq: 'Diferente de',
    gt: 'Maior que',
    gte: 'Maior ou igual',
    lt: 'Menor que',
    lte: 'Menor ou igual',
    in: 'Contém',
    not_in: 'Não contém',
    like: 'Parecido com',
    is_null: 'É vazio',
    is_not_null: 'Não é vazio',
    between: 'Entre',
}

const NO_VALUE_OPERATORS: FilterOperator[] = ['is_null', 'is_not_null']

interface FilterPanelProps {
    filters: FilterSpec[]
    fields: FieldDefinition[]
    onAddFilter: (filter: FilterSpec) => void
    onRemoveFilter: (index: number) => void
    onUpdateFilter: (index: number, filter: FilterSpec) => void
}

export default function FilterPanel({
    filters,
    fields,
    onAddFilter,
    onRemoveFilter,
    onUpdateFilter,
}: FilterPanelProps) {
    const [adding, setAdding] = useState(false)

    const handleAddField = (fieldKey: string) => {
        const def = fields.find(f => f.key === fieldKey)
        if (!def) return

        const defaultOp = def.filterOperators?.[0] ?? 'eq'
        onAddFilter({
            field: fieldKey,
            operator: defaultOp,
            value: NO_VALUE_OPERATORS.includes(defaultOp) ? null : '',
        })
        setAdding(false)
    }

    const getFieldDef = (key: string) => fields.find(f => f.key === key)

    const handleOperatorChange = (idx: number, filter: FilterSpec, newOp: FilterOperator) => {
        let newValue: FilterSpec['value']

        if (NO_VALUE_OPERATORS.includes(newOp)) {
            newValue = null
        } else if (newOp === 'between') {
            newValue = ['', '']
        } else {
            // Reset to empty string when switching between value-based operators
            newValue = ''
        }

        onUpdateFilter(idx, { ...filter, operator: newOp, value: newValue })
    }

    return (
        <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                <Filter className="w-3 h-3 inline-block mr-1" />
                Filtros
            </div>

            {filters.length > 0 && (
                <div className="space-y-1.5 mb-2">
                    {filters.map((filter, idx) => {
                        const def = getFieldDef(filter.field)
                        const operators = def?.filterOperators ?? ['eq']
                        const isNoValue = NO_VALUE_OPERATORS.includes(filter.operator)
                        const isBetween = filter.operator === 'between'
                        const hasOptions = def?.filterOptions && def.filterOptions !== 'dynamic'
                        const isDynamic = def?.filterOptions === 'dynamic'

                        return (
                            <div key={idx} className="bg-white border border-slate-200 rounded-md p-2 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-700">{def?.label ?? filter.field}</span>
                                    <button
                                        onClick={() => onRemoveFilter(idx)}
                                        className="w-4 h-4 flex items-center justify-center text-slate-300 hover:text-red-500"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>

                                <div className="flex gap-1.5">
                                    <select
                                        value={filter.operator}
                                        onChange={(e) => handleOperatorChange(idx, filter, e.target.value as FilterOperator)}
                                        className="text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-600 focus:ring-1 focus:ring-indigo-300 min-w-0"
                                    >
                                        {operators.map(op => (
                                            <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                                        ))}
                                    </select>

                                    {!isNoValue && !isBetween && (
                                        <>
                                            {hasOptions ? (
                                                <select
                                                    value={String(filter.value ?? '')}
                                                    onChange={(e) => onUpdateFilter(idx, { ...filter, value: e.target.value })}
                                                    className="flex-1 text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-600 focus:ring-1 focus:ring-indigo-300 min-w-0"
                                                >
                                                    <option value="">Selecione...</option>
                                                    {(def?.filterOptions as string[]).map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            ) : isDynamic ? (
                                                <input
                                                    type="text"
                                                    value={String(filter.value ?? '')}
                                                    onChange={(e) => onUpdateFilter(idx, { ...filter, value: e.target.value })}
                                                    placeholder="Digite o valor..."
                                                    className="flex-1 text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-600 focus:ring-1 focus:ring-indigo-300 min-w-0"
                                                />
                                            ) : (
                                                <input
                                                    type={def?.dataType === 'number' ? 'number' : def?.dataType === 'date' ? 'date' : 'text'}
                                                    value={String(filter.value ?? '')}
                                                    onChange={(e) => onUpdateFilter(idx, {
                                                        ...filter,
                                                        value: def?.dataType === 'number' ? Number(e.target.value) : e.target.value,
                                                    })}
                                                    placeholder="Valor..."
                                                    className="flex-1 text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-600 focus:ring-1 focus:ring-indigo-300 min-w-0"
                                                />
                                            )}
                                        </>
                                    )}

                                    {/* Between: two inputs */}
                                    {isBetween && (
                                        <div className="flex items-center gap-1 flex-1">
                                            <input
                                                type={def?.dataType === 'number' ? 'number' : def?.dataType === 'date' ? 'date' : 'text'}
                                                value={String(Array.isArray(filter.value) ? filter.value[0] ?? '' : '')}
                                                onChange={(e) => {
                                                    const arr = Array.isArray(filter.value) ? [...filter.value] : ['', '']
                                                    arr[0] = def?.dataType === 'number' ? Number(e.target.value) : e.target.value
                                                    onUpdateFilter(idx, { ...filter, value: arr })
                                                }}
                                                placeholder="De"
                                                className="flex-1 text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-600 focus:ring-1 focus:ring-indigo-300 min-w-0"
                                            />
                                            <span className="text-[10px] text-slate-400">a</span>
                                            <input
                                                type={def?.dataType === 'number' ? 'number' : def?.dataType === 'date' ? 'date' : 'text'}
                                                value={String(Array.isArray(filter.value) ? filter.value[1] ?? '' : '')}
                                                onChange={(e) => {
                                                    const arr = Array.isArray(filter.value) ? [...filter.value] : ['', '']
                                                    arr[1] = def?.dataType === 'number' ? Number(e.target.value) : e.target.value
                                                    onUpdateFilter(idx, { ...filter, value: arr })
                                                }}
                                                placeholder="Até"
                                                className="flex-1 text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-600 focus:ring-1 focus:ring-indigo-300 min-w-0"
                                            />
                                        </div>
                                    )}
                                </div>

                                {idx < filters.length - 1 && (
                                    <div className="text-[10px] text-slate-400 font-medium text-center">E</div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {adding ? (
                <select
                    autoFocus
                    value=""
                    onChange={(e) => handleAddField(e.target.value)}
                    onBlur={() => setAdding(false)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                >
                    <option value="">Selecionar campo...</option>
                    {fields
                        .filter(f => f.filterOperators && f.filterOperators.length > 0)
                        .map(f => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                        ))
                    }
                </select>
            ) : (
                <button
                    onClick={() => setAdding(true)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-500 transition-colors py-1"
                >
                    <Plus className="w-3 h-3" />
                    Adicionar filtro
                </button>
            )}
        </div>
    )
}
