import { Calendar, Filter, RotateCcw } from 'lucide-react'
import { useAnalyticsV2Filters, type DatePresetV2 } from '@/hooks/analyticsV2/useAnalyticsV2Filters'
import { cn } from '@/lib/utils'

const PRESETS: Array<{ key: DatePresetV2; label: string }> = [
  { key: 'last_7d', label: 'Últ. 7 dias' },
  { key: 'last_30d', label: 'Últ. 30 dias' },
  { key: 'last_90d', label: 'Últ. 90 dias' },
  { key: 'this_quarter', label: 'Trimestre' },
  { key: 'this_year', label: 'Ano' },
]

export default function UniversalFilterBar() {
  const datePreset = useAnalyticsV2Filters(s => s.datePreset)
  const from = useAnalyticsV2Filters(s => s.from)
  const to = useAnalyticsV2Filters(s => s.to)
  const setDatePreset = useAnalyticsV2Filters(s => s.setDatePreset)

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Calendar className="w-3.5 h-3.5" />
        <span>Período:</span>
      </div>

      <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => setDatePreset(p.key)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              datePreset === p.key
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <span className="text-xs text-slate-400">
        {from} → {to}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button
          disabled
          title="Em breve — filtros avançados"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-400 bg-slate-50 cursor-not-allowed"
        >
          <Filter className="w-3.5 h-3.5" />
          Mais filtros
        </button>
        <button
          disabled
          title="Em breve"
          className="inline-flex items-center gap-1 text-xs text-slate-400 cursor-not-allowed"
        >
          <RotateCcw className="w-3 h-3" />
          Limpar
        </button>
      </div>
    </div>
  )
}
