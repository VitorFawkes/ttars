import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { useReportBuilderStore } from '@/hooks/reports/useReportBuilderStore'
import { useFieldRegistry } from '@/hooks/reports/useFieldRegistry'
import { useSavedReport, useCreateReport, useUpdateReport } from '@/hooks/reports/useSavedReports'
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
    const isEditing = !!id

    const store = useReportBuilderStore()
    const registry = useFieldRegistry(store.source)
    const createReport = useCreateReport()
    const updateReport = useUpdateReport()

    const [saveOpen, setSaveOpen] = useState(false)

    // Load existing report when editing
    const { data: existingReport } = useSavedReport(id)

    useEffect(() => {
        if (existingReport && !store.isDirty) {
            store.loadFromReport(
                existingReport.config,
                existingReport.visualization,
                existingReport.id,
                existingReport.title,
                existingReport.description ?? '',
            )
        }
    }, [existingReport?.id])

    // Reset on unmount
    useEffect(() => {
        return () => store.reset()
    }, [])

    const handleSave = async (params: { title: string; description: string; visibility: 'private' | 'team' | 'everyone' }) => {
        const iqr = store.toIQR()
        if (!iqr) return

        const viz = store.toVisualization()

        if (isEditing && id) {
            await updateReport.mutateAsync({
                id,
                title: params.title,
                description: params.description,
                config: iqr,
                visualization: viz,
                visibility: params.visibility,
            })
        } else {
            const saved = await createReport.mutateAsync({
                title: params.title,
                description: params.description,
                config: iqr,
                visualization: viz,
                visibility: params.visibility,
            })
            navigate(`/reports/${saved.id}`, { replace: true })
        }
        setSaveOpen(false)
    }

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

    return (
        <div className="flex flex-col h-full">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/reports')}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
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
                    <Save className="w-4 h-4" />
                    Salvar
                </button>
            </div>

            {/* Split panel */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left sidebar — config */}
                <div className="w-72 border-r border-slate-200 overflow-y-auto bg-slate-50/50 p-4 space-y-5 flex-shrink-0">
                    {/* Source */}
                    <SourceSelector
                        value={store.source}
                        onChange={(source) => store.setSource(source)}
                    />

                    {/* Field picker + config — only when source selected */}
                    {store.source && (
                        <>
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
                                onRemoveMeasure={store.removeMeasure}
                                onUpdateMeasure={store.updateMeasure}
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
                        </>
                    )}
                </div>

                {/* Right panel — preview */}
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    {/* Viz selector + order/limit controls */}
                    {store.source && (
                        <div className="space-y-4 mb-6">
                            <VizSelector
                                value={store.visualization.type}
                                onChange={(type) => store.setVisualization({ type })}
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
                onClose={() => setSaveOpen(false)}
                onSave={handleSave}
                initialTitle={store.title}
                initialDescription={store.description}
                isEditing={isEditing}
                saving={createReport.isPending || updateReport.isPending}
            />
        </div>
    )
}
