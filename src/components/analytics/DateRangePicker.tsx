import { useMemo, useRef, useState } from 'react'
import { Calendar, Check, ChevronDown } from 'lucide-react'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths, startOfYear } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAnalyticsFilters, type DatePreset } from '@/hooks/analytics/useAnalyticsFilters'
import { cn } from '@/lib/utils'

interface RangeOption {
  value: DatePreset | 'today' | 'yesterday' | 'this_week' | 'last_7_days' | 'last_30_days' | 'last_60_days' | 'last_90_days'
  label: string
  group: 'rapido' | 'semana' | 'mes' | 'ano'
}

const OPTIONS: RangeOption[] = [
  { value: 'today', label: 'Hoje', group: 'rapido' },
  { value: 'yesterday', label: 'Ontem', group: 'rapido' },
  { value: 'last_7_days', label: 'Últimos 7 dias', group: 'rapido' },
  { value: 'last_30_days', label: 'Últimos 30 dias', group: 'rapido' },
  { value: 'last_60_days', label: 'Últimos 60 dias', group: 'rapido' },
  { value: 'last_90_days', label: 'Últimos 90 dias', group: 'rapido' },

  { value: 'this_week', label: 'Esta semana', group: 'semana' },

  { value: 'this_month', label: 'Este mês', group: 'mes' },
  { value: 'last_month', label: 'Mês passado', group: 'mes' },
  { value: 'last_3_months', label: 'Últimos 3 meses', group: 'mes' },
  { value: 'last_6_months', label: 'Últimos 6 meses', group: 'mes' },

  { value: 'this_year', label: 'Este ano', group: 'ano' },
  { value: 'last_year', label: 'Ano passado', group: 'ano' },
  { value: 'all_time', label: 'Tudo', group: 'ano' },
]

const GROUP_LABELS: Record<RangeOption['group'], string> = {
  rapido: 'Rápido',
  semana: 'Semana',
  mes: 'Mês',
  ano: 'Ano',
}

function rangeForExtendedPreset(value: RangeOption['value']): { start: string; end: string } {
  const now = new Date()
  const end = endOfDay(now).toISOString()
  switch (value) {
    case 'today':
      return { start: startOfDay(now).toISOString(), end }
    case 'yesterday': {
      const y = subDays(now, 1)
      return { start: startOfDay(y).toISOString(), end: endOfDay(y).toISOString() }
    }
    case 'this_week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
        end: endOfWeek(now, { weekStartsOn: 1 }).toISOString(),
      }
    case 'last_7_days':
      return { start: startOfDay(subDays(now, 6)).toISOString(), end }
    case 'last_30_days':
      return { start: startOfDay(subDays(now, 29)).toISOString(), end }
    case 'last_60_days':
      return { start: startOfDay(subDays(now, 59)).toISOString(), end }
    case 'last_90_days':
      return { start: startOfDay(subDays(now, 89)).toISOString(), end }
    case 'this_month':
      return { start: startOfMonth(now).toISOString(), end }
    case 'last_month': {
      const lm = subMonths(now, 1)
      return { start: startOfMonth(lm).toISOString(), end: endOfMonth(lm).toISOString() }
    }
    case 'last_3_months':
      return { start: subMonths(now, 3).toISOString(), end }
    case 'last_6_months':
      return { start: subMonths(now, 6).toISOString(), end }
    case 'this_year':
      return { start: startOfYear(now).toISOString(), end }
    case 'last_year': {
      const ly = subMonths(now, 12)
      return { start: startOfYear(ly).toISOString(), end: startOfYear(now).toISOString() }
    }
    case 'all_time':
      return { start: '2020-01-01T00:00:00.000Z', end }
    default:
      return { start: subDays(now, 29).toISOString(), end }
  }
}

function findOptionByRange(start: string, end: string): RangeOption | null {
  for (const opt of OPTIONS) {
    const candidate = rangeForExtendedPreset(opt.value)
    if (candidate.start.slice(0, 10) === start.slice(0, 10) && candidate.end.slice(0, 10) === end.slice(0, 10)) {
      return opt
    }
  }
  return null
}

export default function DateRangePicker({ compact = false }: { compact?: boolean }) {
  const { dateRange, setDateRange } = useAnalyticsFilters()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [customStart, setCustomStart] = useState(() => dateRange.start.slice(0, 10))
  const [customEnd, setCustomEnd] = useState(() => dateRange.end.slice(0, 10))
  const [showCustom, setShowCustom] = useState(false)

  const matchedOption = useMemo(
    () => findOptionByRange(dateRange.start, dateRange.end),
    [dateRange],
  )

  const labelHumano = useMemo(() => {
    if (matchedOption) return matchedOption.label
    try {
      const s = format(new Date(dateRange.start), "dd 'de' MMM", { locale: ptBR })
      const e = format(new Date(dateRange.end), "dd 'de' MMM yyyy", { locale: ptBR })
      return `${s} → ${e}`
    } catch {
      return 'Personalizado'
    }
  }, [matchedOption, dateRange])

  const grupos = useMemo(() => {
    const map = new Map<RangeOption['group'], RangeOption[]>()
    for (const opt of OPTIONS) {
      const arr = map.get(opt.group) ?? []
      arr.push(opt)
      map.set(opt.group, arr)
    }
    return Array.from(map.entries())
  }, [])

  const escolherPreset = (opt: RangeOption) => {
    setDateRange(rangeForExtendedPreset(opt.value))
    setShowCustom(false)
    if (detailsRef.current) detailsRef.current.open = false
  }

  const aplicarCustom = () => {
    if (!customStart || !customEnd) return
    if (customStart > customEnd) return
    setDateRange({
      start: startOfDay(new Date(customStart + 'T00:00:00')).toISOString(),
      end: endOfDay(new Date(customEnd + 'T00:00:00')).toISOString(),
    })
    if (detailsRef.current) detailsRef.current.open = false
  }

  return (
    <details ref={detailsRef} className="relative">
      <summary
        className={cn(
          'list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md select-none',
          compact
            ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
            : 'text-slate-700 border-slate-300 bg-white hover:bg-slate-50',
        )}
      >
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-500 hidden sm:inline">Período:</span>
        <span className="text-slate-900">{labelHumano}</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </summary>

      <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-3 max-h-[420px] overflow-y-auto">
        {grupos.map(([group, opts]) => (
          <div key={group} className="mb-3 last:mb-0">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1">
              {GROUP_LABELS[group]}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {opts.map(opt => {
                const isActive = matchedOption?.value === opt.value && !showCustom
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => escolherPreset(opt)}
                    className={cn(
                      'text-left px-2 py-1.5 text-xs rounded flex items-center justify-between hover:bg-slate-50',
                      isActive && 'bg-indigo-50 text-indigo-700 font-medium',
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isActive && <Check className="w-3 h-3 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="border-t border-slate-100 pt-2 mt-2">
          <button
            type="button"
            onClick={() => setShowCustom(s => !s)}
            className={cn(
              'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between',
              (showCustom || (!matchedOption && dateRange.start)) && 'bg-indigo-50 text-indigo-700 font-medium',
            )}
          >
            <span>Escolher datas</span>
            <ChevronDown className={cn('w-3 h-3 transition-transform', showCustom && 'rotate-180')} />
          </button>

          {(showCustom || !matchedOption) && (
            <div className="mt-2 px-1 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-8">De</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-8">Até</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded"
                />
              </div>
              <button
                type="button"
                onClick={aplicarCustom}
                disabled={!customStart || !customEnd || customStart > customEnd}
                className="w-full px-2 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>
    </details>
  )
}
