import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getColorScheme, TOOLTIP_STYLE } from '@/lib/reports/chartDefaults'
import { autoFormat } from '@/lib/reports/formatters'
import type { ChartRendererProps } from './ChartRenderer'

interface PieChartRendererProps extends ChartRendererProps {
    variant: 'pie' | 'donut'
}

export default function PieChartRenderer({
    data,
    visualization,
    dimensionKeys,
    measureKeys,
    labelFormat,
    keyFormats,
    onDrillDown,
    variant,
}: PieChartRendererProps) {
    const colors = getColorScheme(visualization.colorScheme)
    const height = visualization.height ?? 340
    const dimKey = dimensionKeys[0]
    const measureKey = measureKeys[0]
    const isDonut = variant === 'donut'

    if (!data.length || !measureKey) {
        return (
            <div className="flex items-center justify-center text-slate-400 text-sm" style={{ height: 200 }}>
                Nenhum registro encontrado
            </div>
        )
    }

    const total = data.reduce((s, r) => s + Number(r[measureKey] ?? 0), 0)
    const fmt = keyFormats?.[measureKey] ?? labelFormat

    const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, index }: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const RADIAN = Math.PI / 180
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5
        const x = cx + radius * Math.cos(-midAngle * RADIAN)
        const y = cy + radius * Math.sin(-midAngle * RADIAN)
        const pct = total > 0 ? ((Number(data[index]?.[measureKey] ?? 0) / total) * 100) : 0
        if (pct < 3) return null
        return (
            <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
                {pct.toFixed(0)}%
            </text>
        )
    }

    return (
        <ResponsiveContainer width="100%" height={height}>
            <PieChart>
                <Pie
                    data={data}
                    dataKey={measureKey}
                    nameKey={dimKey}
                    cx="50%"
                    cy="50%"
                    outerRadius="80%"
                    innerRadius={isDonut ? '55%' : '0%'}
                    strokeWidth={2}
                    stroke="#fff"
                    label={renderLabel}
                    labelLine={false}
                    cursor="pointer"
                    onClick={(entry: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                        if (onDrillDown && dimKey && entry?.[dimKey] != null) {
                            onDrillDown({ [dimKey]: entry[dimKey] })
                        }
                    }}
                >
                    {data.map((_, i) => (
                        <Cell key={i} fill={colors[i % colors.length]} />
                    ))}
                </Pie>
                <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => {
                        const pct = total > 0 ? ` (${((value / total) * 100).toFixed(1)}%)` : ''
                        return [`${autoFormat(value, fmt)}${pct}`, name]
                    }}
                />
                {visualization.showLegend && (
                    <Legend
                        layout="vertical"
                        align="right"
                        verticalAlign="middle"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '12px', paddingLeft: '16px' }}
                    />
                )}
            </PieChart>
        </ResponsiveContainer>
    )
}
