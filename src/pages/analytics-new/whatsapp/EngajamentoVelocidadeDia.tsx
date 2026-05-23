import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  Area,
  ComposedChart,
} from 'recharts'
import type { EngajamentoDailyPoint } from '@/types/engagement'

interface Props {
  points: EngajamentoDailyPoint[]
  isLoading?: boolean
  onDayClick?: (day: string) => void
}

interface ChartPoint {
  day: string
  dayLabel: string
  reply_rate_pct: number | null
  frt_minutes: number | null
  outbound: number
}

function formatMinutes(min: number | null): string {
  if (min === null || min === undefined || min < 0) return '·'
  if (min < 60) return `${Math.round(min)}min`
  if (min < 60 * 24) return `${(min / 60).toFixed(1)}h`
  return `${(min / (60 * 24)).toFixed(1)}d`
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: unknown[] }) {
  if (!active || !payload || payload.length === 0) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (payload[0] as any).payload as ChartPoint
  const day = parseISO(p.day)
  return (
    <div className="bg-white border border-slate-200 shadow-lg rounded-lg p-3 text-xs min-w-[200px]">
      <div className="font-semibold text-slate-900 mb-2">
        {format(day, "EEE, dd 'de' MMM", { locale: ptBR })}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Taxa de resposta</span>
          <span className="font-medium text-emerald-700 tabular-nums">
            {p.reply_rate_pct !== null ? `${p.reply_rate_pct.toFixed(1)}%` : '·'}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">1ª resposta (mediana)</span>
          <span className="font-medium text-sky-700 tabular-nums">
            {formatMinutes(p.frt_minutes)}
          </span>
        </div>
        <div className="border-t border-slate-100 my-1.5" />
        <div className="flex justify-between gap-3 text-[11px] text-slate-400">
          <span>pessoas contatadas</span>
          <span className="tabular-nums">{p.outbound}</span>
        </div>
      </div>
    </div>
  )
}

export default function EngajamentoVelocidadeDia({ points, isLoading, onDayClick }: Props) {
  const data = useMemo<ChartPoint[]>(() => {
    return points.map(p => ({
      day: p.day,
      dayLabel: format(parseISO(p.day), 'dd/MM', { locale: ptBR }),
      reply_rate_pct: p.reply_rate_pct,
      frt_minutes: p.frt_median_minutes,
      outbound: p.outbound,
    }))
  }, [points])

  const avgReply = useMemo(() => {
    const valid = data.filter(d => d.reply_rate_pct !== null && d.outbound > 0)
    if (valid.length === 0) return null
    const totalPeople = valid.reduce((s, d) => s + d.outbound, 0)
    const weighted = valid.reduce(
      (s, d) => s + (d.reply_rate_pct ?? 0) * d.outbound,
      0
    )
    return totalPeople > 0 ? weighted / totalPeople : null
  }, [data])

  const medianFrt = useMemo(() => {
    const vals = data
      .map(d => d.frt_minutes)
      .filter((m): m is number => m !== null && m >= 0)
      .sort((a, b) => a - b)
    if (vals.length === 0) return null
    return vals[Math.floor(vals.length / 2)]
  }, [data])

  if (isLoading) {
    return <div className="h-80 bg-white border border-slate-200 rounded-2xl animate-pulse" />
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="mb-4 flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            Velocidade por dia
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {onDayClick
              ? 'Clique num ponto pra filtrar o painel só pelo cohort daquele dia. Área verde: taxa de resposta. Linha azul: tempo até 1ª resposta.'
              : 'Taxa de resposta (área verde) e tempo até a 1ª resposta (linha azul), por cohort do dia.'}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-baseline gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span className="text-slate-500">média</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {avgReply !== null ? `${avgReply.toFixed(1)}%` : '·'}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
            <span className="text-slate-500">FRT</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {formatMinutes(medianFrt)}
            </span>
          </div>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer>
          <ComposedChart
            data={data}
            margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
            onClick={(state) => {
              if (!onDayClick) return
              const payload = (state as { activePayload?: Array<{ payload: ChartPoint }> })
                ?.activePayload?.[0]?.payload
              if (payload?.day) onDayClick(payload.day)
            }}
            style={onDayClick ? { cursor: 'pointer' } : undefined}
          >
            <defs>
              <linearGradient id="replyRateGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="dayLabel"
              stroke="#94a3b8"
              tick={{ fontSize: 11 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="#10b981"
              tick={{ fontSize: 11 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              tickFormatter={v => `${v}%`}
              domain={[0, 100]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#0ea5e9"
              tick={{ fontSize: 11 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              tickFormatter={v => formatMinutes(v)}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="reply_rate_pct"
              name="Taxa de resposta"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#replyRateGradient)"
              connectNulls
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="frt_minutes"
              name="1ª resposta (min)"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
        Cohort do dia = pessoas que recebem nossa 1ª mensagem nesse dia. A taxa de resposta delas e
        o tempo mediano até responderem (mesmo que respondam dias depois) entram na barra desse dia.
      </p>
    </div>
  )
}
