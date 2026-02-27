import { useState, useMemo } from 'react'
import { GripVertical, X, Loader2, AlertCircle, FileX2 } from 'lucide-react'
import { useReportEngine } from '@/hooks/reports/useReportEngine'
import { useReportDrillDown } from '@/hooks/reports/useReportDrillDown'
import { buildReportKeys, mapDrillFilters } from '@/lib/reports/buildReportKeys'
import { getDefaultVizConfig } from '@/lib/reports/chartDefaults'
import ChartRenderer from '../renderers/ChartRenderer'
import DrillDownPanel from '../renderers/DrillDownPanel'
import type { DashboardWidget, DashboardGlobalFilters, DrillDownFilters } from '@/lib/reports/reportTypes'

interface WidgetCardProps {
    widget: DashboardWidget
    isEditing: boolean
    onRemove?: () => void
    globalFilters?: DashboardGlobalFilters
}

export default function WidgetCard({
    widget,
    isEditing,
    onRemove,
    globalFilters,
}: WidgetCardProps) {
    const report = widget.report
    const title = widget.title_override ?? report?.title ?? 'Widget'

    const { data: queryData, isLoading, error } = useReportEngine({
        config: report?.config ?? null,
        dateStart: globalFilters?.dateRange?.start,
        dateEnd: globalFilters?.dateRange?.end,
        product: globalFilters?.product,
        ownerId: globalFilters?.ownerId,
        enabled: !!report,
    })

    const [drillFilters, setDrillFilters] = useState<DrillDownFilters | null>(null)

    const widgetConfig = report?.config ?? null
    const { dimensionKeys, measureKeys, labels, drillFieldMap, keyFormats, dateGrouping, breakdownKey } = useMemo(() => {
        if (!widgetConfig) return { dimensionKeys: [], measureKeys: [], labels: {}, drillFieldMap: {}, keyFormats: {}, dateGrouping: undefined, breakdownKey: null }
        return buildReportKeys(widgetConfig)
    }, [widgetConfig])

    const mappedDrillFilters = useMemo(() => {
        if (!drillFilters) return null
        return mapDrillFilters(drillFilters, drillFieldMap)
    }, [drillFilters, drillFieldMap])

    const { data: drillData, isLoading: drillLoading } = useReportDrillDown({
        config: report?.config ?? null,
        drillFilters: mappedDrillFilters,
        dateStart: globalFilters?.dateRange?.start,
        dateEnd: globalFilters?.dateRange?.end,
        product: globalFilters?.product,
        ownerId: globalFilters?.ownerId,
    })

    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                    {isEditing && (
                        <GripVertical className="w-4 h-4 text-slate-300 cursor-grab widget-drag-handle flex-shrink-0" />
                    )}
                    <h3 className="text-sm font-semibold text-slate-800 truncate">{title}</h3>
                </div>
                {isEditing && onRemove && (
                    <button
                        onClick={onRemove}
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 p-3 overflow-hidden">
                {!report ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <FileX2 className="w-5 h-5 mb-1" />
                        <p className="text-xs">Relatório fonte não encontrado</p>
                    </div>
                ) : isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-400">
                        <AlertCircle className="w-5 h-5 mb-1" />
                        <p className="text-xs">{(error as Error).message ?? 'Erro ao carregar'}</p>
                    </div>
                ) : queryData && queryData.length > 0 ? (
                    <ChartRenderer
                        data={queryData}
                        visualization={{ ...getDefaultVizConfig(report.visualization.type), ...report.visualization, height: undefined }}
                        dimensionKeys={dimensionKeys}
                        measureKeys={measureKeys}
                        labels={labels}
                        labelFormat={report.visualization.labelFormat}
                        keyFormats={keyFormats}
                        dateGrouping={dateGrouping}
                        breakdownKey={breakdownKey}
                        onDrillDown={(f) => setDrillFilters(f)}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-xs text-slate-400">
                        Nenhum registro encontrado
                    </div>
                )}
            </div>

            {/* Drill-down */}
            {drillFilters && (
                <DrillDownPanel
                    filters={drillFilters}
                    data={drillData}
                    isLoading={drillLoading}
                    onClose={() => setDrillFilters(null)}
                    labels={labels}
                    labelFormat={report?.visualization.labelFormat}
                />
            )}
        </div>
    )
}
