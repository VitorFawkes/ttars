import { useMemo } from 'react'
import { MousePointerClick } from 'lucide-react'
import type { VisualizationConfig, DrillDownFilters } from '@/lib/reports/reportTypes'
import { formatDateAxis } from '@/lib/reports/formatters'
import BarChartRenderer from './BarChartRenderer'
import LineChartRenderer from './LineChartRenderer'
import AreaChartRenderer from './AreaChartRenderer'
import PieChartRenderer from './PieChartRenderer'
import TableRenderer from './TableRenderer'
import KpiRenderer from './KpiRenderer'
import FunnelRenderer from './FunnelRenderer'
import ComposedRenderer from './ComposedRenderer'

export interface ChartRendererProps {
    data: Record<string, unknown>[]
    visualization: VisualizationConfig
    dimensionKeys: string[]
    measureKeys: string[]
    labels?: Record<string, string>
    labelFormat?: 'number' | 'currency' | 'percent'
    keyFormats?: Record<string, 'number' | 'currency' | 'percent'>
    dateGrouping?: 'day' | 'week' | 'month' | 'quarter' | 'year'
    breakdownKey?: string | null
    onDrillDown?: (filters: DrillDownFilters) => void
}

// Composite label key used when multiple dimensions are present
const COMPOSITE_KEY = '_label'

// Types that support drill-down click interaction
const DRILLABLE_TYPES = new Set(['bar_vertical', 'bar_horizontal', 'line', 'area', 'composed', 'pie', 'donut', 'funnel'])

// Types that need chart data transformation (not table/kpi which show raw data)
const CHART_TYPES = new Set(['bar_vertical', 'bar_horizontal', 'line', 'area', 'composed', 'pie', 'donut', 'funnel'])

/**
 * Transforms raw RPC data for chart renderers:
 * - Multiple dimensions → composite label (prevents "duplicate" bars)
 * - Breakdown → pivot data into separate series (stacked/grouped bars)
 */
function useChartData(
    rawData: Record<string, unknown>[],
    dimensionKeys: string[],
    measureKeys: string[],
    labels: Record<string, string> | undefined,
    breakdownKey: string | null | undefined,
    dateGrouping: string | undefined,
    vizType: string,
) {
    return useMemo(() => {
        // Skip transformation for table/kpi — they show raw tabular data
        if (!CHART_TYPES.has(vizType)) {
            return {
                data: rawData,
                dimensionKeys,
                measureKeys,
                labels: labels ?? {},
                originalDimKeys: dimensionKeys,
                isBreakdown: false,
            }
        }

        let data = rawData
        let effDimKeys = dimensionKeys
        let effMeaKeys = measureKeys
        let effLabels = { ...(labels ?? {}) }
        let isBreakdown = false

        // --- Case 1: Breakdown pivot ---
        if (breakdownKey && rawData.length > 0 && rawData[0][breakdownKey] != null) {
            const breakdownValues = [...new Set(rawData.map(r => String(r[breakdownKey] ?? '')))]

            // Build dimension hash for grouping
            const dimHash = (row: Record<string, unknown>) =>
                dimensionKeys.map(k => String(row[k] ?? '')).join('|||')

            // Group rows by dimension values, spread breakdown values as columns
            const grouped = new Map<string, Record<string, unknown>>()
            for (const row of rawData) {
                const hash = dimHash(row)
                if (!grouped.has(hash)) {
                    const base: Record<string, unknown> = {}
                    for (const dk of dimensionKeys) base[dk] = row[dk]
                    grouped.set(hash, base)
                }
                const target = grouped.get(hash)!
                const bv = String(row[breakdownKey] ?? '')
                for (const mk of measureKeys) {
                    target[`${bv}__${mk}`] = row[mk]
                }
            }

            // Build new series keys and labels
            const newMeaKeys: string[] = []
            const newLabels = { ...effLabels }

            for (const bv of breakdownValues) {
                for (const mk of measureKeys) {
                    const key = `${bv}__${mk}`
                    newMeaKeys.push(key)
                    // Single measure: label = breakdown value. Multiple: "value - measure"
                    newLabels[key] = measureKeys.length === 1
                        ? bv
                        : `${bv} — ${effLabels[mk] ?? mk}`
                }
            }

            data = [...grouped.values()]
            effMeaKeys = newMeaKeys
            effLabels = newLabels
            isBreakdown = true
        }

        // --- Case 2: Multiple dimensions → composite label ---
        if (effDimKeys.length > 1) {
            data = data.map(row => ({
                ...row,
                [COMPOSITE_KEY]: effDimKeys.map(k => {
                    const v = String(row[k] ?? '')
                    // Format date values nicely if dateGrouping is set
                    if (dateGrouping && /^\d{4}-\d{2}/.test(v)) {
                        return formatDateAxis(v, dateGrouping as 'day' | 'week' | 'month' | 'quarter' | 'year')
                    }
                    return v
                }).join(' · '),
            }))
            effDimKeys = [COMPOSITE_KEY]
        }

        return {
            data,
            dimensionKeys: effDimKeys,
            measureKeys: effMeaKeys,
            labels: effLabels,
            originalDimKeys: dimensionKeys,
            isBreakdown,
        }
    }, [rawData, dimensionKeys, measureKeys, labels, breakdownKey, dateGrouping, vizType])
}

export default function ChartRenderer(rawProps: ChartRendererProps) {
    const {
        data: rawData,
        visualization,
        dimensionKeys: rawDimKeys,
        measureKeys: rawMeaKeys,
        labels: rawLabels,
        breakdownKey,
        onDrillDown,
        keyFormats: rawKeyFormats,
        ...rest
    } = rawProps

    const processed = useChartData(
        rawData, rawDimKeys, rawMeaKeys, rawLabels,
        breakdownKey, rest.dateGrouping, visualization.type,
    )

    // Propagate keyFormats to pivoted breakdown keys (e.g. "Trips__mea_0" inherits format from "mea_0")
    const keyFormats = useMemo(() => {
        if (!processed.isBreakdown || !rawKeyFormats) return rawKeyFormats
        const adjusted = { ...rawKeyFormats }
        for (const newKey of processed.measureKeys) {
            const originalKey = newKey.split('__').pop()!
            if (rawKeyFormats[originalKey]) {
                adjusted[newKey] = rawKeyFormats[originalKey]
            }
        }
        return adjusted
    }, [processed.isBreakdown, processed.measureKeys, rawKeyFormats])

    // Wrap drill-down to map composite labels back to original dimension values
    const wrappedDrillDown = useMemo(() => {
        if (!onDrillDown) return undefined
        return (filters: DrillDownFilters) => {
            // If filters reference the composite key, find the matching row
            // and extract original dimension values for proper drill-down
            if (COMPOSITE_KEY in filters) {
                const row = processed.data.find(r => r[COMPOSITE_KEY] === filters[COMPOSITE_KEY])
                if (row) {
                    const realFilters: DrillDownFilters = {}
                    for (const dk of processed.originalDimKeys) {
                        if (row[dk] != null) realFilters[dk] = row[dk]
                    }
                    onDrillDown(realFilters)
                    return
                }
            }
            onDrillDown(filters)
        }
    }, [onDrillDown, processed.data, processed.originalDimKeys])

    const isDrillable = onDrillDown && DRILLABLE_TYPES.has(visualization.type)

    const props: ChartRendererProps = {
        ...rest,
        keyFormats,
        visualization,
        data: processed.data,
        dimensionKeys: processed.dimensionKeys,
        measureKeys: processed.measureKeys,
        labels: processed.labels,
        onDrillDown: wrappedDrillDown,
    }

    const chart = (() => {
        switch (visualization.type) {
            case 'bar_vertical':
                return <BarChartRenderer {...props} layout="vertical" isBreakdown={processed.isBreakdown} />
            case 'bar_horizontal':
                return <BarChartRenderer {...props} layout="horizontal" isBreakdown={processed.isBreakdown} />
            case 'line':
                return <LineChartRenderer {...props} />
            case 'area':
                return <AreaChartRenderer {...props} />
            case 'composed':
                return <ComposedRenderer {...props} />
            case 'pie':
                return <PieChartRenderer {...props} variant="pie" />
            case 'donut':
                return <PieChartRenderer {...props} variant="donut" />
            case 'table':
                return <TableRenderer {...props} />
            case 'kpi':
                return <KpiRenderer {...props} />
            case 'funnel':
                return <FunnelRenderer {...props} />
            default:
                return <TableRenderer {...props} />
        }
    })()

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">{chart}</div>
            {isDrillable && (
                <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 justify-center">
                    <MousePointerClick className="w-3 h-3" />
                    Clique em um ponto para ver os registros
                </p>
            )}
        </div>
    )
}
