import { useMemo } from 'react'
import { GripVertical, X, Loader2, AlertCircle } from 'lucide-react'
import { useReportEngine } from '@/hooks/reports/useReportEngine'
import { buildReportKeys } from '@/lib/reports/buildReportKeys'
import ChartRenderer from '../renderers/ChartRenderer'
import type { DashboardWidget, DashboardGlobalFilters } from '@/lib/reports/reportTypes'

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

    const widgetConfig = report?.config ?? null
    const { dimensionKeys, measureKeys, labels, keyFormats, dateGrouping } = useMemo(() => {
        if (!widgetConfig) return { dimensionKeys: [], measureKeys: [], labels: {}, keyFormats: {}, dateGrouping: undefined }
        return buildReportKeys(widgetConfig)
    }, [widgetConfig])

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
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-400">
                        <AlertCircle className="w-5 h-5 mb-1" />
                        <p className="text-xs">{(error as Error).message ?? 'Erro ao carregar'}</p>
                    </div>
                ) : queryData && queryData.length > 0 && report ? (
                    <ChartRenderer
                        data={queryData}
                        visualization={{ ...report.visualization, height: undefined }}
                        dimensionKeys={dimensionKeys}
                        measureKeys={measureKeys}
                        labels={labels}
                        labelFormat={report.visualization.labelFormat}
                        keyFormats={keyFormats}
                        dateGrouping={dateGrouping}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-xs text-slate-400">
                        Nenhum registro encontrado
                    </div>
                )}
            </div>
        </div>
    )
}
