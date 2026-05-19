import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { EngajamentoHeatmapCell } from '@/types/engagement'

interface Props {
  cells: EngajamentoHeatmapCell[]
  isLoading?: boolean
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function EngajamentoHeatmap({ cells, isLoading }: Props) {
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

  // Top horários
  const topSlots = useMemo(() => {
    return cells
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(c => ({
        label: `${WEEKDAY_LABELS[c.weekday]} ${String(c.hour).padStart(2, '0')}h`,
        count: c.count,
      }))
  }, [cells])

  if (isLoading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-2xl animate-pulse" />
  }

  function cellOpacity(value: number): number {
    if (value === 0) return 0
    // log scaling pra evitar que 1-2 valores muito altos dominem
    return Math.min(1, 0.15 + (Math.log(1 + value) / Math.log(1 + max)) * 0.85)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            Quando as pessoas respondem
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Inbounds por dia da semana × hora (horário de Brasília)
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          {total.toLocaleString('pt-BR')} respostas
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* Header: horas */}
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

          {/* Linhas: dias × horas */}
          {WEEKDAY_LABELS.map((day, weekday) => (
            <div key={day} className="flex items-center gap-px mb-px">
              <div className="w-10 text-xs text-slate-500 font-medium pr-1.5 text-right">
                {day}
              </div>
              {Array.from({ length: 24 }).map((_, hour) => {
                const value = matrix[weekday][hour]
                const opacity = cellOpacity(value)
                return (
                  <div
                    key={hour}
                    className="flex-1 aspect-square rounded-sm relative group"
                    title={
                      value > 0
                        ? `${day} ${String(hour).padStart(2, '0')}h — ${value} resposta${value > 1 ? 's' : ''}`
                        : `${day} ${String(hour).padStart(2, '0')}h — sem resposta`
                    }
                    style={{
                      backgroundColor:
                        value > 0
                          ? `rgba(99, 102, 241, ${opacity})`
                          : 'rgb(248 250 252)',
                      transition: 'background-color 200ms ease',
                    }}
                  >
                    {value >= max * 0.7 && value > 0 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">
                        {value}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {/* Legenda */}
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
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 text-xs">
          <span className="text-slate-500">Picos:</span>
          {topSlots.map((s, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium"
            >
              {s.label} <span className="text-indigo-400">·</span> {s.count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
