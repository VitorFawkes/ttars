import { GitCompareArrows } from 'lucide-react'
import type { ComparisonSpec } from '@/lib/reports/reportTypes'

interface ComparisonToggleProps {
    value: ComparisonSpec | null
    onChange: (comp: ComparisonSpec | null) => void
}

export default function ComparisonToggle({ value, onChange }: ComparisonToggleProps) {
    const isActive = value !== null

    return (
        <div className="space-y-2">
            <button
                onClick={() => {
                    if (isActive) {
                        onChange(null)
                    } else {
                        onChange({ type: 'previous_period' })
                    }
                }}
                className="flex items-center gap-2 text-xs text-slate-600 hover:text-indigo-600 transition-colors"
            >
                <div className={`w-8 h-4 rounded-full transition-colors relative ${isActive ? 'bg-indigo-500' : 'bg-slate-200'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <GitCompareArrows className="w-3.5 h-3.5" />
                <span>Comparar com período anterior</span>
            </button>

            {isActive && (
                <select
                    value={value!.type}
                    onChange={(e) => onChange({ type: e.target.value as ComparisonSpec['type'] })}
                    className="text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-600 focus:ring-1 focus:ring-indigo-300"
                >
                    <option value="previous_period">Período anterior</option>
                    <option value="prior_year">Ano anterior</option>
                </select>
            )}
        </div>
    )
}
