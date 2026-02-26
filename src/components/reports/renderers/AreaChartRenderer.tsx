import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, LabelList,
} from 'recharts'
import { getColorScheme, TOOLTIP_STYLE } from '@/lib/reports/chartDefaults'
import { autoFormat, formatDateAxis } from '@/lib/reports/formatters'
import type { ChartRendererProps } from './ChartRenderer'

export default function AreaChartRenderer({
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

    if (!data.length) {
        return (
            <div className="flex items-center justify-center text-slate-400 text-sm" style={{ height: 200 }}>
                Nenhum registro encontrado
            </div>
        )
    }

    const formatValue = (value: number, name: string) => {
        const fmt = keyFormats?.[name] ?? labelFormat
        return [autoFormat(value, fmt), labels?.[name] ?? name]
    }

    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 12, right: 30, left: 10, bottom: 8 }}>
                <defs>
                    {measureKeys.map((key, i) => (
                        <linearGradient key={key} id={`grad_${key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0.02} />
                        </linearGradient>
                    ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                    dataKey={dimKey}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={isTimeseries ? (v) => formatDateAxis(v, dateGrouping) : undefined}
                />
                <YAxis
                    tickFormatter={(v) => autoFormat(v, keyFormats?.[measureKeys[0]] ?? labelFormat)}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                />
                <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => formatValue(value, name)}
                    labelFormatter={isTimeseries ? (v) => formatDateAxis(String(v), dateGrouping) : (v) => String(v)}
                />
                {visualization.showLegend && measureKeys.length > 1 && (
                    <Legend
                        formatter={(value) => labels?.[value] ?? value}
                        wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }}
                    />
                )}
                {measureKeys.map((key, i) => (
                    <Area
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={labels?.[key] ?? key}
                        stroke={colors[i % colors.length]}
                        strokeWidth={2.5}
                        fill={`url(#grad_${key})`}
                        activeDot={{
                            r: 5,
                            strokeWidth: 2,
                            stroke: '#fff',
                            onClick: (_: unknown, payload: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                                if (onDrillDown && dimKey && payload?.payload?.[dimKey] != null) {
                                    onDrillDown({ [dimKey]: payload.payload[dimKey] })
                                }
                            },
                        }}
                    >
                        {visualization.showDataLabels !== false && data.length <= 20 && (
                            <LabelList
                                dataKey={key}
                                position="top"
                                formatter={(val: number) => autoFormat(val, keyFormats?.[key] ?? labelFormat)}
                                style={{ fontSize: 10, fontWeight: 500, fill: '#475569' }}
                            />
                        )}
                    </Area>
                ))}
            </AreaChart>
        </ResponsiveContainer>
    )
}
