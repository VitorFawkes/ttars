import { useFilterOptions } from '@/hooks/useFilterOptions'
import type { DashboardGlobalFilters } from '@/lib/reports/reportTypes'

interface DashboardFiltersProps {
    filters: DashboardGlobalFilters
    onChange: (filters: DashboardGlobalFilters) => void
}

const DATE_PRESETS = [
    { value: 'all_time', label: 'Todo período' },
    { value: 'this_month', label: 'Este mês' },
    { value: 'last_month', label: 'Mês passado' },
    { value: 'last_3_months', label: 'Últimos 3 meses' },
    { value: 'last_6_months', label: 'Últimos 6 meses' },
    { value: 'this_year', label: 'Este ano' },
]

const PRODUCTS = [
    { value: 'ALL', label: 'Todos' },
    { value: 'TRIPS', label: 'Trips' },
    { value: 'WEDDING', label: 'Wedding' },
    { value: 'CORP', label: 'Corp' },
]

function resolveDatePreset(preset: string): { start: string; end: string } | undefined {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()

    switch (preset) {
        case 'this_month':
            return {
                start: new Date(year, month, 1).toISOString(),
                end: new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
            }
        case 'last_month':
            return {
                start: new Date(year, month - 1, 1).toISOString(),
                end: new Date(year, month, 0, 23, 59, 59).toISOString(),
            }
        case 'last_3_months':
            return {
                start: new Date(year, month - 2, 1).toISOString(),
                end: new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
            }
        case 'last_6_months':
            return {
                start: new Date(year, month - 5, 1).toISOString(),
                end: new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
            }
        case 'this_year':
            return {
                start: new Date(year, 0, 1).toISOString(),
                end: new Date(year, 11, 31, 23, 59, 59).toISOString(),
            }
        case 'all_time':
        default:
            return undefined
    }
}

export default function DashboardFilters({ filters, onChange }: DashboardFiltersProps) {
    const { data: filterOptions } = useFilterOptions()
    const profiles = filterOptions?.profiles ?? []

    const handleDatePresetChange = (preset: string) => {
        const dateRange = resolveDatePreset(preset)
        onChange({ ...filters, datePreset: preset, dateRange })
    }

    return (
        <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Período:</span>
                <select
                    value={filters.datePreset ?? 'all_time'}
                    onChange={(e) => handleDatePresetChange(e.target.value)}
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

            <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Consultor:</span>
                <select
                    value={filters.ownerId ?? ''}
                    onChange={(e) => onChange({ ...filters, ownerId: e.target.value || null })}
                    className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                >
                    <option value="">Todos</option>
                    {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name ?? p.email ?? p.id}</option>
                    ))}
                </select>
            </div>
        </div>
    )
}
