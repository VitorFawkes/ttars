import { X, GripVertical } from 'lucide-react'
import type {
    DimensionSpec, MeasureSpec, ComputedMeasureSpec,
    FieldDefinition, Aggregation, DateGrouping, ComputedMeasureDefinition,
} from '@/lib/reports/reportTypes'

const AGG_LABELS: Record<Aggregation, string> = {
    count: 'Contagem',
    count_distinct: 'Únicos',
    sum: 'Soma',
    avg: 'Média',
    min: 'Mínimo',
    max: 'Máximo',
}

const DATE_GROUPING_LABELS: Record<DateGrouping, string> = {
    day: 'Dia',
    week: 'Semana',
    month: 'Mês',
    quarter: 'Trimestre',
    year: 'Ano',
}

interface ConfigPanelProps {
    dimensions: DimensionSpec[]
    measures: MeasureSpec[]
    computedMeasures: ComputedMeasureSpec[]
    breakdownBy: DimensionSpec | null

    // Field definitions for labels
    dimensionDefs: FieldDefinition[]
    measureDefs: FieldDefinition[]
    computedMeasureDefs: ComputedMeasureDefinition[]

    onRemoveDimension: (field: string) => void
    onUpdateDimension: (field: string, updates: Partial<DimensionSpec>) => void
    onRemoveMeasure: (field: string) => void
    onUpdateMeasure: (field: string, updates: Partial<MeasureSpec>) => void
    onRemoveComputedMeasure: (key: string) => void
    onSetBreakdownBy: (dim: DimensionSpec | null) => void

    // Available dimensions for breakdown dropdown
    availableDimensions: FieldDefinition[]
}

export default function ConfigPanel({
    dimensions,
    measures,
    computedMeasures,
    breakdownBy,
    dimensionDefs,
    measureDefs,
    computedMeasureDefs,
    onRemoveDimension,
    onUpdateDimension,
    onRemoveMeasure,
    onUpdateMeasure,
    onRemoveComputedMeasure,
    onSetBreakdownBy,
    availableDimensions,
}: ConfigPanelProps) {
    const getFieldLabel = (key: string, defs: FieldDefinition[]) =>
        defs.find(d => d.key === key)?.label ?? key

    const getFieldDef = (key: string, defs: FieldDefinition[]) =>
        defs.find(d => d.key === key)

    return (
        <div className="space-y-4">
            {/* Dimensions */}
            <Section title="Dimensões (Eixo X)">
                {dimensions.length === 0 ? (
                    <EmptyHint>Selecione uma dimensão na lista de campos</EmptyHint>
                ) : (
                    <div className="space-y-1">
                        {dimensions.map((dim) => {
                            const def = getFieldDef(dim.field, dimensionDefs)
                            const isDate = def?.dataType === 'date'
                            return (
                                <ConfigItem
                                    key={dim.field}
                                    label={getFieldLabel(dim.field, dimensionDefs)}
                                    onRemove={() => onRemoveDimension(dim.field)}
                                >
                                    {isDate && def?.dateGroupings && (
                                        <select
                                            value={dim.dateGrouping ?? 'month'}
                                            onChange={(e) => onUpdateDimension(dim.field, { dateGrouping: e.target.value as DateGrouping })}
                                            className="text-[10px] bg-slate-100 border-0 rounded px-1.5 py-0.5 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                                        >
                                            {def.dateGroupings.map(g => (
                                                <option key={g} value={g}>{DATE_GROUPING_LABELS[g]}</option>
                                            ))}
                                        </select>
                                    )}
                                </ConfigItem>
                            )
                        })}
                    </div>
                )}
            </Section>

            {/* Measures */}
            <Section title="Medidas (Eixo Y)">
                {measures.length === 0 && computedMeasures.length === 0 ? (
                    <EmptyHint>Selecione uma medida na lista de campos</EmptyHint>
                ) : (
                    <div className="space-y-1">
                        {measures.map((m) => {
                            const def = getFieldDef(m.field, measureDefs)
                            return (
                                <ConfigItem
                                    key={m.field}
                                    label={getFieldLabel(m.field, measureDefs)}
                                    onRemove={() => onRemoveMeasure(m.field)}
                                >
                                    {def?.aggregations && def.aggregations.length > 1 && (
                                        <select
                                            value={m.aggregation}
                                            onChange={(e) => onUpdateMeasure(m.field, { aggregation: e.target.value as Aggregation })}
                                            className="text-[10px] bg-slate-100 border-0 rounded px-1.5 py-0.5 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                                        >
                                            {def.aggregations.map(a => (
                                                <option key={a} value={a}>{AGG_LABELS[a]}</option>
                                            ))}
                                        </select>
                                    )}
                                    {def?.aggregations?.length === 1 && (
                                        <span className="text-[10px] text-slate-400 px-1.5">{AGG_LABELS[m.aggregation]}</span>
                                    )}
                                </ConfigItem>
                            )
                        })}
                        {computedMeasures.map((cm) => {
                            const def = computedMeasureDefs.find(d => d.key === cm.key)
                            return (
                                <ConfigItem
                                    key={cm.key}
                                    label={def?.label ?? cm.key}
                                    onRemove={() => onRemoveComputedMeasure(cm.key)}
                                >
                                    <span className="text-[10px] text-indigo-400 font-mono px-1.5">fx</span>
                                </ConfigItem>
                            )
                        })}
                    </div>
                )}
            </Section>

            {/* Breakdown */}
            <Section title="Agrupar Por (Série)">
                {breakdownBy ? (
                    <ConfigItem
                        label={getFieldLabel(breakdownBy.field, dimensionDefs)}
                        onRemove={() => onSetBreakdownBy(null)}
                    />
                ) : (
                    <select
                        value=""
                        onChange={(e) => {
                            if (e.target.value) {
                                onSetBreakdownBy({ field: e.target.value })
                            }
                        }}
                        className="w-full text-xs bg-slate-50 border border-dashed border-slate-200 rounded-md px-2.5 py-1.5 text-slate-400 focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
                    >
                        <option value="">+ Agrupar por série</option>
                        {availableDimensions
                            .filter(d => !dimensions.some(dim => dim.field === d.key))
                            .map(d => (
                                <option key={d.key} value={d.key}>{d.label}</option>
                            ))
                        }
                    </select>
                )}
            </Section>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                {title}
            </div>
            {children}
        </div>
    )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-xs text-slate-400 italic py-1.5 px-2.5">
            {children}
        </div>
    )
}

function ConfigItem({
    label,
    onRemove,
    children,
}: {
    label: string
    onRemove: () => void
    children?: React.ReactNode
}) {
    return (
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1.5 group">
            <GripVertical className="w-3 h-3 text-slate-300 flex-shrink-0" />
            <span className="text-xs text-slate-700 truncate flex-1">{label}</span>
            {children}
            <button
                onClick={onRemove}
                className="w-4 h-4 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    )
}
