import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core'
import { ArrowLeft, Save, Copy, Loader2, AlertCircle } from 'lucide-react'
import { useReportBuilderStore } from '@/hooks/reports/useReportBuilderStore'
import { useFieldRegistry } from '@/hooks/reports/useFieldRegistry'
import { useSavedReport, useCreateReport, useUpdateReport } from '@/hooks/reports/useSavedReports'
import { useAuth } from '@/contexts/AuthContext'
import { getDefaultVizConfig } from '@/lib/reports/chartDefaults'
import type { DateGrouping } from '@/lib/reports/reportTypes'

import SourceSelector from './builder/SourceSelector'
import FieldPicker from './builder/FieldPicker'
import ConfigPanel from './builder/ConfigPanel'
import FilterPanel from './builder/FilterPanel'
import VizSelector from './builder/VizSelector'
import ReportPreview from './builder/ReportPreview'
import ComparisonToggle from './builder/ComparisonToggle'
import SaveReportDialog from './builder/SaveReportDialog'

export default function ReportBuilder() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const templateId = searchParams.get('template') ?? undefined
    const isEditing = !!id

    const { session, profile } = useAuth()
    const store = useReportBuilderStore()
    const registry = useFieldRegistry(store.source)
    const createReport = useCreateReport()
    const updateReport = useUpdateReport()

    const [saveOpen, setSaveOpen] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    // Cross-component DnD: FieldPicker → ConfigPanel
    const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null)
    const outerSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    )
    const handlePickerDragStart = useCallback((event: DragStartEvent) => {
        const data = event.active.data.current
        if (data?.type === 'picker-field') {
            setActiveDragLabel(data.field?.label ?? data.label ?? data.key ?? '')
        }
    }, [])
    const handlePickerDragEnd = useCallback((event: DragEndEvent) => {
        setActiveDragLabel(null)
        const { active, over } = event
        const data = active.data.current
        if (!data || data.type !== 'picker-field' || !over) return

        // Smart-add: auto-route to correct zone based on field role
        // Even if user drops on wrong zone, add to the correct one
        const droppedOnAnyZone = over.id === 'dropzone-dimensions' || over.id === 'dropzone-measures'
        if (!droppedOnAnyZone) return

        if (data.role === 'dimension') {
            const dim: { field: string; dateGrouping?: DateGrouping } = { field: data.field.key }
            if (data.field.dataType === 'date') dim.dateGrouping = 'month'
            store.addDimension(dim)
        } else if (data.role === 'measure') {
            const defaultAgg = data.field.aggregations?.[0] ?? 'count'
            store.addMeasure({ field: data.field.key, aggregation: defaultAgg })
        } else if (data.role === 'computed') {
            store.addComputedMeasure({ type: 'computed', key: data.key })
        }
    }, [store])
    const handlePickerDragCancel = useCallback(() => setActiveDragLabel(null), [])

    // Load existing report when editing, or template when creating from template
    const { data: existingReport, isLoading: reportLoading, error: reportError } = useSavedReport(id)
    const { data: templateReport } = useSavedReport(templateId)

    // Can edit if: new report, owner, or admin
    // While loading, canEdit=false to avoid accidental overwrites (button shows "Salvar cópia" until loaded)
    const canEdit = !isEditing || (!!existingReport && (existingReport.created_by === session?.user?.id || profile?.is_admin === true))

    const existingReportId = existingReport?.id
    const { loadFromReport, reset, editingReportId } = store

    useEffect(() => {
        if (existingReport && existingReportId !== editingReportId) {
            loadFromReport(
                existingReport.config,
                existingReport.visualization,
                existingReport.id,
                existingReport.title,
                existingReport.description ?? '',
                existingReport.visibility as 'private' | 'team' | 'everyone' | undefined,
            )
        }
    }, [existingReport, existingReportId, editingReportId, loadFromReport])

    // Load template when creating from template (new report, not editing)
    const templateReportId = templateReport?.id
    useEffect(() => {
        if (templateReport && !isEditing && templateReportId !== editingReportId) {
            loadFromReport(
                templateReport.config,
                templateReport.visualization,
                undefined, // Don't set editingReportId — this is a new report
                `${templateReport.title} (cópia)`,
                templateReport.description ?? '',
                'private',
            )
        }
    }, [templateReport, templateReportId, isEditing, editingReportId, loadFromReport])

    // Reset on unmount
    useEffect(() => {
        return () => reset()
    }, [reset])

    // Warn before losing unsaved changes
    useEffect(() => {
        if (!store.isDirty) return
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [store.isDirty])

    const handleSave = useCallback(async (params: { title: string; description: string; visibility: 'private' | 'team' | 'everyone' }) => {
        const iqr = store.toIQR()
        if (!iqr) return

        const viz = store.toVisualization()
        setSaveError(null)

        try {
            if (isEditing && id && canEdit) {
                // Update existing report (owner or admin)
                await updateReport.mutateAsync({
                    id,
                    title: params.title,
                    description: params.description,
                    config: iqr,
                    visualization: viz,
                    visibility: params.visibility,
                })
            } else {
                // Create new report (new or fork from non-owned)
                const saved = await createReport.mutateAsync({
                    title: params.title,
                    description: params.description,
                    config: iqr,
                    visualization: viz,
                    visibility: params.visibility,
                })
                navigate(`/reports/${saved.id}`, { replace: true })
            }
            // Sync dialog values back to the store so top-bar input and next save dialog open stay consistent
            store.setTitle(params.title)
            store.setDescription(params.description)
            store.setVisibility(params.visibility)
            store.markSaved()
            setSaveOpen(false)
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Erro ao salvar relatório')
        }
    }, [store, isEditing, id, canEdit, updateReport, createReport, navigate])

    // Build active keys for FieldPicker disabled state
    const activeDimensions = store.dimensions.map(d => d.field)
    const activeMeasures = store.measures.map(m => m.field)
    const activeComputedMeasures = store.computedMeasures.map(cm => cm.key)

    // Available order fields
    const orderOptions = [
        ...store.dimensions.map(d => {
            const def = registry.dimensions.find(f => f.key === d.field)
            return { key: d.field, label: def?.label ?? d.field }
        }),
        ...store.measures.map(m => {
            const def = registry.measures.find(f => f.key === m.field)
            return { key: m.field, label: `${def?.label ?? m.field}` }
        }),
    ]

    // Loading/error state when editing existing report
    if (isEditing && reportLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
        )
    }

    if (isEditing && reportError) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <AlertCircle className="w-8 h-8 mb-2 text-red-400" />
                <p className="text-sm font-medium text-slate-700">Relatório não encontrado</p>
                <p className="text-xs text-slate-400 mt-1">O relatório pode ter sido excluído ou você não tem permissão.</p>
                <button
                    onClick={() => navigate('/reports')}
                    className="mt-3 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                    Voltar para relatórios
                </button>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/reports')}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        aria-label="Voltar para relatórios"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <input
                        type="text"
                        value={store.title}
                        onChange={(e) => store.setTitle(e.target.value)}
                        placeholder="Título do Relatório"
                        className="text-lg font-semibold text-slate-900 bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-slate-300 w-64"
                    />
                </div>
                <button
                    onClick={() => setSaveOpen(true)}
                    disabled={!store.toIQR()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {!canEdit ? <Copy className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {!canEdit ? 'Salvar cópia' : 'Salvar'}
                </button>
            </div>

            {/* Split panel */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left sidebar — config */}
                <div className="w-72 border-r border-slate-200 overflow-y-auto bg-slate-50/50 p-4 space-y-5 flex-shrink-0">
                    {/* Source */}
                    <SourceSelector
                        value={store.source}
                        onChange={(source) => {
                            if (store.source === source) return
                            // Warn if there's existing config that will be lost
                            const hasConfig = store.dimensions.length > 0 || store.measures.length > 0 || store.computedMeasures.length > 0 || store.filters.length > 0
                            if (hasConfig) {
                                if (!confirm('Trocar a fonte irá limpar todas as dimensões, medidas e filtros configurados. Continuar?')) return
                            }
                            store.setSource(source)
                        }}
                    />

                    {/* Field picker + config — only when source selected */}
                    {store.source && (
                        <DndContext
                            sensors={outerSensors}
                            onDragStart={handlePickerDragStart}
                            onDragEnd={handlePickerDragEnd}
                            onDragCancel={handlePickerDragCancel}
                        >
                            <FieldPicker
                                dimensions={registry.dimensions}
                                measures={registry.measures}
                                computedMeasures={registry.computedMeasures}
                                dimensionCategories={registry.dimensionCategories}
                                measureCategories={registry.measureCategories}
                                onAddDimension={(field) => {
                                    const dim: { field: string; dateGrouping?: DateGrouping } = { field: field.key }
                                    if (field.dataType === 'date') {
                                        dim.dateGrouping = 'month'
                                    }
                                    store.addDimension(dim)
                                }}
                                onAddMeasure={(field, agg) => {
                                    store.addMeasure({ field: field.key, aggregation: agg })
                                }}
                                onAddComputedMeasure={(key) => {
                                    store.addComputedMeasure({ type: 'computed', key })
                                }}
                                activeDimensions={activeDimensions}
                                activeMeasures={activeMeasures}
                                activeComputedMeasures={activeComputedMeasures}
                            />

                            <ConfigPanel
                                dimensions={store.dimensions}
                                measures={store.measures}
                                computedMeasures={store.computedMeasures}
                                breakdownBy={store.breakdownBy}
                                dimensionDefs={registry.dimensions}
                                measureDefs={registry.measures}
                                computedMeasureDefs={registry.computedMeasures}
                                onRemoveDimension={store.removeDimension}
                                onUpdateDimension={store.updateDimension}
                                onReorderDimensions={store.reorderDimensions}
                                onRemoveMeasure={store.removeMeasure}
                                onUpdateMeasure={store.updateMeasure}
                                onReorderMeasures={store.reorderMeasures}
                                onRemoveComputedMeasure={store.removeComputedMeasure}
                                onSetBreakdownBy={store.setBreakdownBy}
                                availableDimensions={registry.dimensions}
                            />

                            <FilterPanel
                                filters={store.filters}
                                fields={registry.allFields}
                                onAddFilter={store.addFilter}
                                onRemoveFilter={store.removeFilter}
                                onUpdateFilter={store.updateFilter}
                            />

                            <ComparisonToggle
                                value={store.comparison}
                                onChange={store.setComparison}
                            />

                            <DragOverlay dropAnimation={null}>
                                {activeDragLabel && (
                                    <div className="bg-white shadow-lg rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 border border-indigo-200 whitespace-nowrap">
                                        {activeDragLabel}
                                    </div>
                                )}
                            </DragOverlay>
                        </DndContext>
                    )}
                </div>

                {/* Right panel — preview */}
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    {/* Viz selector + order/limit controls */}
                    {store.source && (
                        <div className="space-y-4 mb-6">
                            <VizSelector
                                value={store.visualization.type}
                                onChange={(type) => {
                                    if (type !== store.visualization.type) {
                                        const defaults = getDefaultVizConfig(type)
                                        // Preserve user-set colorScheme and labelFormat across type changes
                                        store.setVisualization({
                                            ...defaults,
                                            colorScheme: store.visualization.colorScheme,
                                            labelFormat: store.visualization.labelFormat,
                                        })
                                    }
                                }}
                            />

                            <div className="flex items-center gap-4 flex-wrap">
                                {/* Order by */}
                                {orderOptions.length > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-slate-400">Ordenar:</span>
                                        <select
                                            value={store.orderBy?.field ?? ''}
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    store.setOrderBy({ field: e.target.value, direction: store.orderBy?.direction ?? 'desc' })
                                                } else {
                                                    store.setOrderBy(null)
                                                }
                                            }}
                                            className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                                        >
                                            <option value="">Nenhum</option>
                                            {orderOptions.map(o => (
                                                <option key={o.key} value={o.key}>{o.label}</option>
                                            ))}
                                        </select>
                                        {store.orderBy && (
                                            <select
                                                value={store.orderBy.direction}
                                                onChange={(e) => store.setOrderBy({ ...store.orderBy!, direction: e.target.value as 'asc' | 'desc' })}
                                                className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                                            >
                                                <option value="desc">Maior → Menor</option>
                                                <option value="asc">Menor → Maior</option>
                                            </select>
                                        )}
                                    </div>
                                )}

                                {/* Limit */}
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-400">Limite:</span>
                                    <input
                                        type="number"
                                        value={store.limit}
                                        onChange={(e) => store.setLimit(Number(e.target.value))}
                                        min={1}
                                        max={5000}
                                        className="w-16 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                                    />
                                </div>

                                {/* Show data labels toggle */}
                                {!['table', 'kpi'].includes(store.visualization.type) && (
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={store.visualization.showDataLabels !== false}
                                            onChange={(e) => store.setVisualization({ showDataLabels: e.target.checked })}
                                            className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-300"
                                        />
                                        <span className="text-xs text-slate-500">Rótulos nos dados</span>
                                    </label>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Live preview */}
                    <ReportPreview />
                </div>
            </div>

            {/* Save dialog */}
            <SaveReportDialog
                open={saveOpen}
                onClose={() => { setSaveOpen(false); setSaveError(null) }}
                onSave={handleSave}
                initialTitle={!canEdit ? `${store.title} (cópia)` : store.title}
                initialDescription={store.description}
                initialVisibility={!canEdit ? 'private' : store.visibility}
                isEditing={isEditing && canEdit}
                saving={createReport.isPending || updateReport.isPending}
                error={saveError}
            />
        </div>
    )
}
