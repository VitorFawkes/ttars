import type { VisualizationConfig, DrillDownFilters } from '@/lib/reports/reportTypes'
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
    onDrillDown?: (filters: DrillDownFilters) => void
}

export default function ChartRenderer(props: ChartRendererProps) {
    const { visualization } = props

    switch (visualization.type) {
        case 'bar_vertical':
            return <BarChartRenderer {...props} layout="vertical" />
        case 'bar_horizontal':
            return <BarChartRenderer {...props} layout="horizontal" />
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
}
