import { useState, useMemo } from 'react'
import { Search, Plus, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldDefinition, Aggregation, ComputedMeasureDefinition } from '@/lib/reports/reportTypes'

interface FieldPickerProps {
    dimensions: FieldDefinition[]
    measures: FieldDefinition[]
    computedMeasures: ComputedMeasureDefinition[]
    dimensionCategories: string[]
    measureCategories: string[]
    onAddDimension: (field: FieldDefinition) => void
    onAddMeasure: (field: FieldDefinition, aggregation: Aggregation) => void
    onAddComputedMeasure: (key: string) => void
    activeDimensions: string[]
    activeMeasures: string[]
    activeComputedMeasures: string[]
}

export default function FieldPicker({
    dimensions,
    measures,
    computedMeasures,
    dimensionCategories,
    measureCategories,
    onAddDimension,
    onAddMeasure,
    onAddComputedMeasure,
    activeDimensions,
    activeMeasures,
    activeComputedMeasures,
}: FieldPickerProps) {
    const [search, setSearch] = useState('')
    const [tab, setTab] = useState<'dimensions' | 'measures'>('dimensions')

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        if (!q) return tab === 'dimensions' ? dimensions : measures
        const list = tab === 'dimensions' ? dimensions : measures
        return list.filter(f =>
            f.label.toLowerCase().includes(q) ||
            f.category.toLowerCase().includes(q) ||
            (f.description?.toLowerCase().includes(q) ?? false)
        )
    }, [search, tab, dimensions, measures])

    const categories = tab === 'dimensions' ? dimensionCategories : measureCategories
    const grouped = useMemo(() => {
        const map: Record<string, FieldDefinition[]> = {}
        for (const cat of categories) map[cat] = []
        for (const f of filtered) {
            if (!map[f.category]) map[f.category] = []
            map[f.category].push(f)
        }
        return Object.entries(map).filter(([, fields]) => fields.length > 0)
    }, [filtered, categories])

    const activeKeys = tab === 'dimensions' ? activeDimensions : activeMeasures

    return (
        <div className="space-y-3">
            {/* Tab Toggle */}
            <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
                <button
                    type="button"
                    onClick={() => setTab('dimensions')}
                    title="Campos para agrupar (eixo X, categorias)"
                    className={cn(
                        'flex-1 text-xs font-medium py-1.5 rounded-md transition-all',
                        tab === 'dimensions' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
                    )}
                >
                    Dimensões ({dimensions.length})
                </button>
                <button
                    type="button"
                    onClick={() => setTab('measures')}
                    title="Valores para calcular (eixo Y, totais)"
                    className={cn(
                        'flex-1 text-xs font-medium py-1.5 rounded-md transition-all',
                        tab === 'measures' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
                    )}
                >
                    Medidas ({measures.length})
                </button>
            </div>

            {/* Hint */}
            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <Info className="w-3 h-3 flex-shrink-0" />
                {tab === 'dimensions'
                    ? 'Dimensões definem os agrupamentos (ex: etapa, mês, responsável)'
                    : 'Medidas são os valores calculados (ex: total, média, contagem)'
                }
            </p>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar campos..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
            </div>

            {/* Fields grouped by category */}
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {grouped.map(([category, fields]) => (
                    <div key={category}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                            {category}
                        </div>
                        <div className="space-y-0.5">
                            {fields.map((field) => {
                                const isActive = activeKeys.includes(field.key)
                                return (
                                    <button
                                        key={field.key}
                                        type="button"
                                        disabled={isActive}
                                        title={field.description ?? field.label}
                                        onClick={() => {
                                            if (tab === 'dimensions') {
                                                onAddDimension(field)
                                            } else {
                                                const defaultAgg = field.aggregations?.[0] ?? 'count'
                                                onAddMeasure(field, defaultAgg)
                                            }
                                        }}
                                        className={cn(
                                            'flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-xs transition-all group',
                                            isActive
                                                ? 'bg-slate-100 text-slate-400 line-through cursor-not-allowed'
                                                : 'text-slate-600 hover:bg-slate-50'
                                        )}
                                    >
                                        <div className="min-w-0">
                                            <span className="truncate block">{field.label}</span>
                                            {field.description && !isActive && (
                                                <span className="text-[10px] text-slate-400 truncate block opacity-0 group-hover:opacity-100 transition-opacity">{field.description}</span>
                                            )}
                                        </div>
                                        {!isActive && (
                                            <Plus className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ))}

                {/* Computed Measures (only in measures tab, filtered by search) */}
                {tab === 'measures' && computedMeasures.length > 0 && (() => {
                    const q = search.toLowerCase()
                    const filteredCM = q
                        ? computedMeasures.filter(cm =>
                            cm.label.toLowerCase().includes(q) ||
                            (cm.description?.toLowerCase().includes(q) ?? false)
                        )
                        : computedMeasures
                    if (filteredCM.length === 0) return null
                    return (
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                            Calculados
                        </div>
                        <div className="space-y-0.5">
                            {filteredCM.map((cm) => {
                                const isActive = activeComputedMeasures.includes(cm.key)
                                return (
                                    <button
                                        key={cm.key}
                                        type="button"
                                        disabled={isActive}
                                        title={cm.description}
                                        onClick={() => onAddComputedMeasure(cm.key)}
                                        className={cn(
                                            'flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-xs transition-all',
                                            isActive
                                                ? 'bg-slate-100 text-slate-400 line-through cursor-not-allowed'
                                                : 'text-slate-600 hover:bg-slate-50'
                                        )}
                                    >
                                        <div>
                                            <span className="truncate">{cm.label}</span>
                                            <span className="text-[10px] text-slate-400 ml-1.5">fx</span>
                                        </div>
                                        {!isActive && <Plus className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    )
                })()}
            </div>
        </div>
    )
}
