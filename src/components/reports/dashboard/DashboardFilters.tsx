import type { DashboardGlobalFilters } from '@/lib/reports/reportTypes'

interface DashboardFiltersProps {
    filters: DashboardGlobalFilters
    onChange: (filters: DashboardGlobalFilters) => void
}

const DATE_PRESETS = [
    { value: 'this_month', label: 'Este mês' },
    { value: 'last_month', label: 'Mês passado' },
    { value: 'last_3_months', label: 'Últimos 3 meses' },
    { value: 'last_6_months', label: 'Últimos 6 meses' },
    { value: 'this_year', label: 'Este ano' },
    { value: 'all_time', label: 'Todo período' },
]

const PRODUCTS = [
    { value: 'ALL', label: 'Todos' },
    { value: 'TRIPS', label: 'Trips' },
    { value: 'WEDDING', label: 'Wedding' },
    { value: 'CORP', label: 'Corp' },
]

export default function DashboardFilters({ filters, onChange }: DashboardFiltersProps) {
    return (
        <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Período:</span>
                <select
                    value={filters.datePreset ?? 'last_3_months'}
                    onChange={(e) => onChange({ ...filters, datePreset: e.target.value })}
                    className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                >
                    {DATE_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                </select>
            </div>

            <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Produto:</span>
                <select
                    value={filters.product ?? 'ALL'}
                    onChange={(e) => onChange({ ...filters, product: e.target.value })}
                    className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                >
                    {PRODUCTS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                </select>
            </div>
        </div>
    )
}
