import { useState, useEffect, useMemo } from 'react'
import { Loader2, AlertCircle, BarChart3 } from 'lucide-react'
import { useReportBuilderStore } from '@/hooks/reports/useReportBuilderStore'
import { useReportEngine } from '@/hooks/reports/useReportEngine'
import { useReportDrillDown } from '@/hooks/reports/useReportDrillDown'
import { buildReportKeys, mapDrillFilters } from '@/lib/reports/buildReportKeys'
import ChartRenderer from '../renderers/ChartRenderer'
import DrillDownPanel from '../renderers/DrillDownPanel'
import type { DrillDownFilters, ReportIQR } from '@/lib/reports/reportTypes'

interface ReportPreviewProps {
    dateStart?: string
    dateEnd?: string
    product?: string
    ownerId?: string
}

export default function ReportPreview({ dateStart, dateEnd, product, ownerId }: ReportPreviewProps) {
    const store = useReportBuilderStore()
    const [drillFilters, setDrillFilters] = useState<DrillDownFilters | null>(null)

    // Debounced IQR — 500ms after last change
    const [debouncedIQR, setDebouncedIQR] = useState<ReportIQR | null>(null)
    const currentIQR = store.toIQR()
    const iqrKey = JSON.stringify(currentIQR)

    useEffect(() => {
        const timer = setTimeout(() => {
            // Clear drill-down when config changes
            setDrillFilters(null)
            setDebouncedIQR(currentIQR)
        }, 500)
        return () => clearTimeout(timer)
    }, [iqrKey, currentIQR])

    const hasMinimumConfig = store.source && store.measures.length > 0

    const { data: queryData, isLoading, error } = useReportEngine({
        config: debouncedIQR,
        dateStart,
        dateEnd,
        product,
        ownerId,
        enabled: !!debouncedIQR && !!hasMinimumConfig,
    })

    // Build keys/labels matching RPC output aliases (dim_0, mea_0, etc.)
    const { dimensionKeys, measureKeys, labels, drillFieldMap, keyFormats, dateGrouping } = useMemo(() => {
        if (!currentIQR) return { dimensionKeys: [], measureKeys: [], labels: {}, drillFieldMap: {}, keyFormats: {}, dateGrouping: undefined }
        return buildReportKeys(currentIQR)
    }, [currentIQR])

    // Map drill filters from data keys (dim_0) to actual field names (ps.nome)
    const mappedDrillFilters = useMemo(() => {
        if (!drillFilters) return null
        return mapDrillFilters(drillFilters, drillFieldMap)
    }, [drillFilters, drillFieldMap])

    const { data: drillData, isLoading: isDrillLoading } = useReportDrillDown({
        config: debouncedIQR,
        drillFilters: mappedDrillFilters,
        dateStart,
        dateEnd,
        product,
        ownerId,
    })

    // Empty state — no source
    if (!store.source) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-400">
                <BarChart3 className="w-12 h-12 mb-3 text-slate-200" />
                <p className="text-sm font-medium">Selecione uma fonte de dados</p>
                <p className="text-xs mt-1">Escolha a fonte na barra lateral para começar</p>
            </div>
        )
    }

    // Empty state — no measures
    if (!hasMinimumConfig) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-400">
                <BarChart3 className="w-12 h-12 mb-3 text-slate-200" />
                <p className="text-sm font-medium">Configure seu relatório</p>
                <p className="text-xs mt-1">Adicione pelo menos uma medida para ver o preview</p>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
                <p className="text-xs">Executando relatório...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-red-400">
                <AlertCircle className="w-8 h-8 mb-3" />
                <p className="text-sm font-medium">Erro ao executar</p>
                <p className="text-xs mt-1 max-w-md text-center">{(error as Error).message}</p>
            </div>
        )
    }

    const data = queryData ?? []

    return (
        <div className="space-y-4">
            {/* Results info */}
            <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{data.length} resultado{data.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Chart */}
            {data.length > 0 ? (
                <ChartRenderer
                    data={data}
                    visualization={store.visualization}
                    dimensionKeys={dimensionKeys}
                    measureKeys={measureKeys}
                    labels={labels}
                    labelFormat={store.visualization.labelFormat}
                    keyFormats={keyFormats}
                    dateGrouping={dateGrouping}
                    onDrillDown={(filters) => setDrillFilters(filters)}
                />
            ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <p className="text-sm">Nenhum resultado encontrado</p>
                    <p className="text-xs mt-1">Tente ajustar os filtros ou o período</p>
                </div>
            )}

            {/* Drill-down panel */}
            {drillFilters && (
                <DrillDownPanel
                    filters={drillFilters}
                    data={drillData}
                    isLoading={isDrillLoading}
                    onClose={() => setDrillFilters(null)}
                    labels={labels}
                    labelFormat={store.visualization.labelFormat}
                />
            )}
        </div>
    )
}
