import {
    BarChart3, BarChartHorizontal, TrendingUp, AreaChart,
    PieChart, Table2, Hash, Triangle, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VizType } from '@/lib/reports/reportTypes'
import { VIZ_LABELS } from '@/lib/reports/chartDefaults'
import type { LucideIcon } from 'lucide-react'

const VIZ_ICON_MAP: Record<VizType, LucideIcon> = {
    bar_vertical: BarChart3,
    bar_horizontal: BarChartHorizontal,
    line: TrendingUp,
    area: AreaChart,
    composed: Layers,
    pie: PieChart,
    donut: PieChart,
    table: Table2,
    kpi: Hash,
    funnel: Triangle,
}

interface VizSelectorProps {
    value: VizType
    onChange: (type: VizType) => void
}

export default function VizSelector({ value, onChange }: VizSelectorProps) {
    return (
        <div className="flex flex-wrap gap-1">
            {(Object.keys(VIZ_LABELS) as VizType[]).map((type) => {
                const Icon = VIZ_ICON_MAP[type]
                const isActive = value === type
                return (
                    <button
                        key={type}
                        onClick={() => onChange(type)}
                        title={VIZ_LABELS[type]}
                        className={cn(
                            'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all',
                            isActive
                                ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        )}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{VIZ_LABELS[type]}</span>
                    </button>
                )
            })}
        </div>
    )
}
