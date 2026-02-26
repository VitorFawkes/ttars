import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, Cell,
} from 'recharts'
import { getColorScheme, TOOLTIP_STYLE } from '@/lib/reports/chartDefaults'
import { autoFormat } from '@/lib/reports/formatters'
import type { ChartRendererProps } from './ChartRenderer'

interface BarChartRendererProps extends ChartRendererProps {
    layout: 'vertical' | 'horizontal'
}

export default function BarChartRenderer({
    data,
    visualization,
    dimensionKeys,
    measureKeys,
    labels,
    labelFormat,
    onDrillDown,
    layout,
}: BarChartRendererProps) {
    const colors = getColorScheme(visualization.colorScheme)
    const dimKey = dimensionKeys[0]
    const isHorizontal = layout === 'horizontal'
    // Dynamic height for horizontal: adapt to number of bars
    const height = isHorizontal
        ? Math.max(280, data.length * 40 + 60)
        : (visualization.height ?? 360)

    const handleClick = (entry: Record<string, unknown>) => {
        if (onDrillDown && dimKey && entry[dimKey] != null) {
            onDrillDown({ [dimKey]: entry[dimKey] })
        }
    }

    if (!data.length) {
        return (
            <div className="flex items-center justify-center text-slate-400 text-sm" style={{ height: 200 }}>
                Sem dados para exibir
            </div>
        )
    }

    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart
                data={data}
                layout={isHorizontal ? 'vertical' : 'horizontal'}
                margin={isHorizontal
                    ? { top: 8, right: 30, left: 10, bottom: 8 }
                    : { top: 12, right: 20, left: 10, bottom: 40 }
                }
                barCategoryGap="20%"
            >
                <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e2e8f0"
                    vertical={isHorizontal}
                    horizontal={!isHorizontal}
                />
                {isHorizontal ? (
                    <>
                        <XAxis
                            type="number"
                            tickFormatter={(v) => autoFormat(v, labelFormat)}
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            dataKey={dimKey}
                            type="category"
                            tick={{ fontSize: 11, fill: '#475569' }}
                            width={140}
                            axisLine={false}
                            tickLine={false}
                        />
                    </>
                ) : (
                    <>
                        <XAxis
                            dataKey={dimKey}
                            tick={{ fontSize: 11, fill: '#475569' }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            angle={data.length > 8 ? -35 : 0}
                            textAnchor={data.length > 8 ? 'end' : 'middle'}
                            height={data.length > 8 ? 80 : 40}
                        />
                        <YAxis
                            tickFormatter={(v) => autoFormat(v, labelFormat)}
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                        />
                    </>
                )}
                <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [autoFormat(value, labelFormat), labels?.[name] ?? name]}
                    labelFormatter={(label) => labels?.[dimKey] ? `${labels[dimKey]}: ${label}` : String(label)}
                />
                {visualization.showLegend && measureKeys.length > 1 && (
                    <Legend
                        formatter={(value) => labels?.[value] ?? value}
                        wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }}
                    />
                )}
                {measureKeys.map((key, i) => (
                    <Bar
                        key={key}
                        dataKey={key}
                        name={labels?.[key] ?? key}
                        fill={colors[i % colors.length]}
                        radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                        maxBarSize={60}
                        cursor="pointer"
                        onClick={(entry: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                            if (entry) handleClick(entry)
                        }}
                    >
                        {measureKeys.length === 1 && data.map((_, idx) => (
                            <Cell key={idx} fill={colors[idx % colors.length]} />
                        ))}
                    </Bar>
                ))}
            </BarChart>
        </ResponsiveContainer>
    )
}
