import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { getColorScheme, TOOLTIP_STYLE } from '@/lib/reports/chartDefaults'
import { autoFormat, formatDateAxis } from '@/lib/reports/formatters'
import type { ChartRendererProps } from './ChartRenderer'

export default function ComposedRenderer({
    data,
    visualization,
    dimensionKeys,
    measureKeys,
    labels,
    labelFormat,
    keyFormats,
    dateGrouping,
    onDrillDown,
}: ChartRendererProps) {
    const colors = getColorScheme(visualization.colorScheme)
    const height = visualization.height ?? 360
    const dimKey = dimensionKeys[0]
    const isTimeseries = data.length > 0 && dimKey && typeof data[0][dimKey] === 'string' && !isNaN(Date.parse(String(data[0][dimKey])))

    if (!data.length || measureKeys.length < 1) {
        return (
            <div className="flex items-center justify-center text-slate-400 text-sm" style={{ height: 200 }}>
                Nenhum registro encontrado
            </div>
        )
    }

    const barKey = measureKeys[0]
    const lineKeys = measureKeys.slice(1)
    const hasRightAxis = lineKeys.length > 0

    const formatValue = (value: number, name: string) => {
        const fmt = keyFormats?.[name] ?? labelFormat
        return [autoFormat(value, fmt), labels?.[name] ?? name]
    }

    return (
        <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={data} margin={{ top: 12, right: hasRightAxis ? 30 : 20, left: 10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                    dataKey={dimKey}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={isTimeseries ? (v) => formatDateAxis(v, dateGrouping) : undefined}
                />
                <YAxis
                    yAxisId="left"
                    tickFormatter={(v) => autoFormat(v, keyFormats?.[barKey] ?? labelFormat)}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                />
                {hasRightAxis && (
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickFormatter={(v) => autoFormat(v, keyFormats?.[lineKeys[0]] ?? labelFormat)}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                    />
                )}
                <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => formatValue(value, name)}
                    labelFormatter={isTimeseries ? (v) => formatDateAxis(String(v), dateGrouping) : (v) => String(v)}
                />
                {visualization.showLegend !== false && measureKeys.length > 1 && (
                    <Legend
                        formatter={(value) => labels?.[value] ?? value}
                        wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }}
                    />
                )}
                <Bar
                    yAxisId="left"
                    dataKey={barKey}
                    name={labels?.[barKey] ?? barKey}
                    fill={colors[0]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={60}
                    cursor="pointer"
                    onClick={(entry: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                        if (onDrillDown && dimKey && entry?.[dimKey] != null) {
                            onDrillDown({ [dimKey]: entry[dimKey] })
                        }
                    }}
                    opacity={0.85}
                />
                {lineKeys.map((key, i) => (
                    <Line
                        key={key}
                        yAxisId={hasRightAxis ? 'right' : 'left'}
                        type="monotone"
                        dataKey={key}
                        name={labels?.[key] ?? key}
                        stroke={colors[(i + 1) % colors.length]}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: colors[(i + 1) % colors.length], strokeWidth: 0 }}
                    />
                ))}
            </ComposedChart>
        </ResponsiveContainer>
    )
}
