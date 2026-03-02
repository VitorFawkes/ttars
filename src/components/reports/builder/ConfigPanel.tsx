import {
    DndContext,
    closestCenter,
    useDroppable,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
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
    onReorderDimensions: (oldIndex: number, newIndex: number) => void
    onRemoveMeasure: (field: string) => void
    onUpdateMeasure: (field: string, updates: Partial<MeasureSpec>) => void
    onReorderMeasures: (oldIndex: number, newIndex: number) => void
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
    onReorderDimensions,
    onRemoveMeasure,
    onUpdateMeasure,
    onReorderMeasures,
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
            <DroppableSection title="Dimensões (Eixo X)" droppableId="dropzone-dimensions">
                {dimensions.length === 0 ? (
                    <EmptyHint>Arraste ou clique uma dimensão na lista de campos</EmptyHint>
                ) : (
                    <SortableList
                        items={dimensions.map(d => d.field)}
                        onReorder={onReorderDimensions}
                    >
                        <div className="space-y-1">
                            {dimensions.map((dim) => {
                                const def = getFieldDef(dim.field, dimensionDefs)
                                const isDate = def?.dataType === 'date'
                                return (
                                    <SortableConfigItem
                                        key={dim.field}
                                        id={dim.field}
                                        label={getFieldLabel(dim.field, dimensionDefs)}
                                        onRemove={() => onRemoveDimension(dim.field)}
                                        sortable={dimensions.length > 1}
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
                                    </SortableConfigItem>
                                )
                            })}
                        </div>
                    </SortableList>
                )}
            </DroppableSection>

            {/* Measures */}
            <DroppableSection title="Medidas (Eixo Y)" droppableId="dropzone-measures">
                {measures.length === 0 && computedMeasures.length === 0 ? (
                    <EmptyHint>Arraste ou clique uma medida na lista de campos</EmptyHint>
                ) : (
                    <div className="space-y-1">
                        <SortableList
                            items={measures.map(m => m.field)}
                            onReorder={onReorderMeasures}
                        >
                            <div className="space-y-1">
                                {measures.map((m) => {
                                    const def = getFieldDef(m.field, measureDefs)
                                    return (
                                        <SortableConfigItem
                                            key={m.field}
                                            id={m.field}
                                            label={getFieldLabel(m.field, measureDefs)}
                                            onRemove={() => onRemoveMeasure(m.field)}
                                            sortable={measures.length > 1}
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
                                        </SortableConfigItem>
                                    )
                                })}
                            </div>
                        </SortableList>
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
            </DroppableSection>

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

// ============================================================
// Sortable list wrapper
// ============================================================

function SortableList({
    items,
    onReorder,
    children,
}: {
    items: string[]
    onReorder: (oldIndex: number, newIndex: number) => void
    children: React.ReactNode
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            const oldIndex = items.indexOf(String(active.id))
            const newIndex = items.indexOf(String(over.id))
            if (oldIndex !== -1 && newIndex !== -1) {
                onReorder(oldIndex, newIndex)
            }
        }
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={items}
                strategy={verticalListSortingStrategy}
            >
                {children}
            </SortableContext>
        </DndContext>
    )
}

// ============================================================
// Sortable config item (drag-and-drop enabled)
// ============================================================

function SortableConfigItem({
    id,
    label,
    onRemove,
    sortable,
    children,
}: {
    id: string
    label: string
    onRemove: () => void
    sortable?: boolean
    children?: React.ReactNode
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 0,
        position: 'relative' as const,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1.5 group',
                isDragging && 'shadow-lg border-indigo-200 opacity-90 z-50',
            )}
        >
            {sortable && (
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 -ml-0.5 p-0.5 rounded hover:bg-slate-50 transition-colors"
                >
                    <GripVertical className="w-3 h-3" />
                </div>
            )}
            <span className="text-xs text-slate-700 truncate flex-1">{label}</span>
            {children}
            <button
                onClick={onRemove}
                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    )
}

// ============================================================
// Non-sortable config item (computed measures, breakdown)
// ============================================================

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
            <span className="text-xs text-slate-700 truncate flex-1">{label}</span>
            {children}
            <button
                onClick={onRemove}
                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    )
}

// ============================================================
// Shared UI
// ============================================================

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

function DroppableSection({ title, droppableId, children }: { title: string; droppableId: string; children: React.ReactNode }) {
    const { isOver, setNodeRef } = useDroppable({ id: droppableId })

    return (
        <div ref={setNodeRef}>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                {title}
            </div>
            <div className={cn(
                'rounded-lg transition-all min-h-[36px]',
                isOver && 'ring-2 ring-dashed ring-indigo-300 bg-indigo-50/50',
            )}>
                {children}
            </div>
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
