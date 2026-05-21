import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { EngajamentoHeatmapCell } from '@/types/engagement'

interface Props {
  cells: EngajamentoHeatmapCell[]
  isLoading?: boolean
  activeWeekday: number | null
  activeHour: number | null
  onCellClick: (weekday: number | null, hour: number | null) => void
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function EngajamentoHeatmap({
  cells,
  isLoading,
  activeWeekday,
  activeHour,
  onCellClick,
}: Props) {
  const { matrix, max } = useMemo(() => {
    const m: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    let max = 0
    for (const c of cells) {
      if (c.weekday >= 0 && c.weekday <= 6 && c.hour >= 0 && c.hour <= 23) {
        m[c.weekday][c.hour] = c.count
        if (c.count > max) max = c.count
      }
    }
    return { matrix: m, max: Math.max(1, max) }
  }, [cells])

  const total = cells.reduce((s, c) => s + c.count, 0)

  const topSlots = useMemo(() => {
    return cells
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(c => ({
        weekday: c.weekday,
        hour: c.hour,
        label: `${WEEKDAY_LABELS[c.weekday]} ${String(c.hour).padStart(2, '0')}h`,
        count: c.count,
      }))
  }, [cells])

  function cellOpacity(value: number): number {
    if (value === 0) return 0
    return Math.min(1, 0.15 + (Math.log(1 + value) / Math.log(1 + max)) * 0.85)
  }

  function handleCellClick(weekday: number, hour: number, value: number) {
    if (value === 0) return
    const isActive = activeWeekday === weekday && activeHour === hour
    onCellClick(isActive ? null : weekday, isActive ? null : hour)
  }

  if (isLoading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-2xl animate-pulse" />
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            Quando as pessoas respondem
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Cada célula conta pessoas únicas. Clique pra filtrar o dashboard só por elas.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {activeWeekday !== null && activeHour !== null && (
            <button
              onClick={() => onCellClick(null, null)}
              className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100 flex items-center gap-1"
            >
              {WEEKDAY_LABELS[activeWeekday]} {String(activeHour).padStart(2, '0')}h
              <span className="text-indigo-400">×</span>
            </button>
          )}
          <div className="text-slate-400">{total.toLocaleString('pt-BR')} pessoas (com sobreposição)</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="flex items-center gap-px ml-10 mb-1">
            {Array.from({ length: 24 }).map((_, h) => (
              <div
                key={h}
                className={cn(
                  'flex-1 text-[10px] text-slate-400 text-center font-medium',
                  h % 3 !== 0 && 'opacity-0'
                )}
              >
                {h % 3 === 0 ? `${h}h` : ''}
              </div>
            ))}
          </div>

          {WEEKDAY_LABELS.map((day, weekday) => (
            <div key={day} className="flex items-center gap-px mb-px">
              <div className="w-10 text-xs text-slate-500 font-medium pr-1.5 text-right">
                {day}
              </div>
              {Array.from({ length: 24 }).map((_, hour) => {
                const value = matrix[weekday][hour]
                const opacity = cellOpacity(value)
                const isActive = activeWeekday === weekday && activeHour === hour
                const isClickable = value > 0
                return (
                  <button
                    key={hour}
                    onClick={() => handleCellClick(weekday, hour, value)}
                    disabled={!isClickable}
                    className={cn(
                      'flex-1 aspect-square rounded-sm relative group',
                      isClickable && 'cursor-pointer hover:ring-2 hover:ring-indigo-300 hover:scale-110',
                      !isClickable && 'cursor-default',
                      isActive && 'ring-2 ring-indigo-600 scale-110 z-10'
                    )}
                    title={
                      value > 0
                        ? `${day} ${String(hour).padStart(2, '0')}h · ${value} pessoa${value > 1 ? 's' : ''} respondendo · clique pra filtrar`
                        : `${day} ${String(hour).padStart(2, '0')}h · ninguém`
                    }
                    style={{
                      backgroundColor:
                        value > 0 ? `rgba(99, 102, 241, ${opacity})` : 'rgb(248 250 252)',
                      transition: 'all 150ms cubic-bezier(0.23, 1, 0.32, 1)',
                    }}
                  >
                    {value >= max * 0.7 && value > 0 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white pointer-events-none">
                        {value}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
            <span>menos</span>
            <div className="flex gap-px">
              {[0.15, 0.3, 0.5, 0.7, 0.95].map(o => (
                <div
                  key={o}
                  className="w-4 h-3 rounded-sm"
                  style={{ backgroundColor: `rgba(99, 102, 241, ${o})` }}
                />
              ))}
            </div>
            <span>mais</span>
          </div>
        </div>
      </div>

      {topSlots.length > 0 && topSlots[0].count > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 text-xs flex-wrap">
          <span className="text-slate-500">Picos:</span>
          {topSlots.map((s, idx) => {
            const isActive = activeWeekday === s.weekday && activeHour === s.hour
            return (
              <button
                key={idx}
                onClick={() => handleCellClick(s.weekday, s.hour, s.count)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                )}
              >
                {s.label} <span className={isActive ? 'text-indigo-200' : 'text-indigo-400'}>·</span> {s.count}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
