import { useMemo } from 'react'
import { Filter, X, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFilterOptions } from '@/hooks/useFilterOptions'
import type { DashboardGlobalFilters } from '@/lib/reports/reportTypes'

interface DashboardFiltersProps {
    filters: DashboardGlobalFilters
    onChange: (filters: DashboardGlobalFilters) => void
    /** Hide consultant filter (e.g. in ReportViewer which has its own context) */
    hideOwner?: boolean
}

const DATE_PRESETS = [
    { value: 'today', label: 'Hoje' },
    { value: 'last_7_days', label: '7 dias' },
    { value: 'this_month', label: 'Este mês' },
    { value: 'last_month', label: 'Mês passado' },
    { value: 'last_3_months', label: '3 meses' },
    { value: 'last_6_months', label: '6 meses' },
    { value: 'this_year', label: 'Este ano' },
    { value: 'all_time', label: 'Tudo' },
]

const PRODUCTS = [
    { value: 'TRIPS', label: 'Trips' },
    { value: 'WEDDING', label: 'Wedding' },
    { value: 'CORP', label: 'Corp' },
]

// eslint-disable-next-line react-refresh/only-export-components
export function resolveDatePreset(preset: string): { start: string; end: string } | undefined {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()

    switch (preset) {
        case 'today':
            return {
                start: new Date(year, month, now.getDate(), 0, 0, 0).toISOString(),
                end: new Date(year, month, now.getDate(), 23, 59, 59).toISOString(),
            }
        case 'last_7_days':
            return {
                start: new Date(year, month, now.getDate() - 6, 0, 0, 0).toISOString(),
                end: new Date(year, month, now.getDate(), 23, 59, 59).toISOString(),
            }
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

export default function DashboardFilters({ filters, onChange, hideOwner }: DashboardFiltersProps) {
    const { data: filterOptions } = useFilterOptions()
    const profiles = filterOptions?.profiles ?? []

    const isCustom = filters.datePreset === 'custom'

    // Count active filters (non-default)
    const activeCount = useMemo(() => {
        let count = 0
        if (filters.datePreset && filters.datePreset !== 'all_time') count++
        if (filters.product) count++
        if (filters.ownerId) count++
        return count
    }, [filters.datePreset, filters.product, filters.ownerId])

    const handleDatePresetChange = (preset: string) => {
        if (preset === 'custom') {
            const now = new Date()
            const defaultRange = {
                start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
                end: now.toISOString().split('T')[0],
            }
            onChange({ ...filters, datePreset: 'custom', dateRange: filters.dateRange ?? defaultRange })
        } else {
            const dateRange = resolveDatePreset(preset)
            onChange({ ...filters, datePreset: preset, dateRange })
        }
    }

    const handleCustomDateChange = (field: 'start' | 'end', value: string) => {
        const current = filters.dateRange ?? { start: '', end: '' }
        const updated = { ...current, [field]: value ? new Date(value + 'T00:00:00').toISOString() : '' }
        onChange({ ...filters, dateRange: updated })
    }

    const handleClear = () => {
        onChange({})
    }

    const toInputDate = (iso?: string) => {
        if (!iso) return ''
        return iso.split('T')[0]
    }

    return (
        <div className="flex items-center gap-4 flex-wrap">
            {/* Date preset pills — 1-click selection (Analytics pattern) */}
            <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400 mr-1" />
                {DATE_PRESETS.map(p => (
                    <button
                        type="button"
                        key={p.value}
                        onClick={() => handleDatePresetChange(p.value)}
                        className={cn(
                            'px-2.5 py-1 text-xs rounded-md transition-all duration-150 font-medium',
                            (filters.datePreset ?? 'all_time') === p.value
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        )}
                    >
                        {p.label}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => handleDatePresetChange('custom')}
                    className={cn(
                        'px-2.5 py-1 text-xs rounded-md transition-all duration-150 font-medium',
                        isCustom
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    )}
                >
                    Personalizado
                </button>
            </div>

            {/* Custom date inputs */}
            {isCustom && (
                <div className="flex items-center gap-1.5">
                    <input
                        type="date"
                        value={toInputDate(filters.dateRange?.start)}
                        onChange={(e) => handleCustomDateChange('start', e.target.value)}
                        className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                    />
                    <span className="text-xs text-slate-400">até</span>
                    <input
                        type="date"
                        value={toInputDate(filters.dateRange?.end)}
                        onChange={(e) => handleCustomDateChange('end', e.target.value)}
                        className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                    />
                </div>
            )}

            {/* Separator */}
            <div className="w-px h-5 bg-slate-200" />

            {/* Product toggle pills (Analytics pattern) */}
            <div className="flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
                {PRODUCTS.map(p => (
                    <button
                        type="button"
                        key={p.value}
                        onClick={() => onChange({ ...filters, product: p.value })}
                        className={cn(
                            'px-2.5 py-1 text-xs rounded-md transition-all duration-150 font-medium',
                            (filters.product ?? 'TRIPS') === p.value
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        )}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Consultant dropdown (dynamic — stays as select) */}
            {!hideOwner && (
                <>
                    <div className="w-px h-5 bg-slate-200" />
                    <select
                        value={filters.ownerId ?? ''}
                        onChange={(e) => onChange({ ...filters, ownerId: e.target.value || null })}
                        className={cn(
                            'text-xs border rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-300 transition-colors',
                            filters.ownerId
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                                : 'bg-white border-slate-200 text-slate-600'
                        )}
                    >
                        <option value="">Consultor: Todos</option>
                        {profiles.map(p => (
                            <option key={p.id} value={p.id}>{p.full_name ?? p.email ?? p.id}</option>
                        ))}
                    </select>
                </>
            )}

            {/* Clear filters button */}
            {activeCount > 0 && (
                <>
                    <div className="w-px h-5 bg-slate-200" />
                    <button
                        type="button"
                        onClick={handleClear}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    >
                        <X className="w-3 h-3" />
                        Limpar ({activeCount})
                    </button>
                </>
            )}
        </div>
    )
}
