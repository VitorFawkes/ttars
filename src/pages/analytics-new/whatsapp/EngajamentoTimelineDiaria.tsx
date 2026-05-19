import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ResponsiveContainer,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  ComposedChart,
} from 'recharts'
import type { EngajamentoDailyPoint } from '@/types/engagement'

interface Props {
  points: EngajamentoDailyPoint[]
  isLoading?: boolean
}

interface ChartPoint {
  day: string
  dayLabel: string
  responderam: number
  sem_resposta: number
  outbound: number
  msgs_out: number
  msgs_in: number
  new_contacts: number
  new_replies: number
  wins: number
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: unknown[] }) {
  if (!active || !payload || payload.length === 0) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (payload[0] as any).payload as ChartPoint
  const day = parseISO(p.day)
  const replyRate =
    p.outbound > 0 ? ((p.responderam / p.outbound) * 100).toFixed(0) : '—'
  return (
    <div className="bg-white border border-slate-200 shadow-lg rounded-lg p-3 text-xs min-w-[220px]">
      <div className="font-semibold text-slate-900 mb-2">
        {format(day, "EEE, dd 'de' MMM", { locale: ptBR })}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Pessoas contatadas</span>
          <span className="font-medium text-slate-900 tabular-nums">{p.outbound}</span>
        </div>
        <div className="flex justify-between gap-3 pl-2 border-l-2 border-emerald-300">
          <span className="text-slate-500">↳ responderam</span>
          <span className="font-medium text-emerald-700 tabular-nums">
            {p.responderam} <span className="text-slate-400">({replyRate}%)</span>
          </span>
        </div>
        <div className="flex justify-between gap-3 pl-2 border-l-2 border-slate-300">
          <span className="text-slate-500">↳ silêncio</span>
          <span className="font-medium text-slate-600 tabular-nums">{p.sem_resposta}</span>
        </div>
        <div className="border-t border-slate-100 my-1.5" />
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Novos contatos (1ª vez)</span>
          <span className="font-medium text-indigo-700 tabular-nums">{p.new_contacts}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">1ª resposta recebida</span>
          <span className="font-medium text-sky-700 tabular-nums">{p.new_replies}</span>
        </div>
        {p.wins > 0 && (
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Vendas ganhas</span>
            <span className="font-medium text-amber-700 tabular-nums">{p.wins}</span>
          </div>
        )}
        <div className="border-t border-slate-100 my-1.5" />
        <div className="flex justify-between gap-3 text-[11px] text-slate-400">
          <span>volume de msgs</span>
          <span className="tabular-nums">
            {p.msgs_out} env · {p.msgs_in} rec
          </span>
        </div>
      </div>
    </div>
  )
}

export default function EngajamentoTimelineDiaria({ points, isLoading }: Props) {
  const data = useMemo<ChartPoint[]>(() => {
    return points.map(p => ({
      day: p.day,
      dayLabel: format(parseISO(p.day), 'dd/MM', { locale: ptBR }),
      responderam: p.inbound,
      sem_resposta: p.no_reply,
      outbound: p.outbound,
      msgs_out: p.msgs_out,
      msgs_in: p.msgs_in,
      new_contacts: p.new_contacts,
      new_replies: p.new_replies,
      wins: p.wins,
    }))
  }, [points])

  const totals = useMemo(() => {
    return data.reduce(
      (acc, p) => ({
        outbound: acc.outbound + p.outbound,
        responderam: acc.responderam + p.responderam,
        sem_resposta: acc.sem_resposta + p.sem_resposta,
        new_contacts: acc.new_contacts + p.new_contacts,
        wins: acc.wins + p.wins,
      }),
      { outbound: 0, responderam: 0, sem_resposta: 0, new_contacts: 0, wins: 0 }
    )
  }, [data])

  if (isLoading) {
    return <div className="h-80 bg-white border border-slate-200 rounded-2xl animate-pulse" />
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="mb-4 flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            Pessoas por dia
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Cada barra é o total de pessoas contatadas naquele dia — verde respondeu, cinza ficou no silêncio
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-baseline gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span className="text-slate-500">responderam</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {totals.responderam.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
            <span className="text-slate-500">silêncio</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {totals.sem_resposta.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
            <span className="text-slate-500">novos</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {totals.new_contacts.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            <span className="text-slate-500">vendas</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {totals.wins.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="dayLabel"
              stroke="#94a3b8"
              tick={{ fontSize: 11 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fontSize: 11 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
            />
            <Bar
              dataKey="responderam"
              stackId="pessoas"
              name="Responderam"
              fill="#10b981"
              radius={[0, 0, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              dataKey="sem_resposta"
              stackId="pessoas"
              name="Sem resposta"
              fill="#cbd5e1"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            <Line
              type="monotone"
              dataKey="new_contacts"
              name="Novos contatos"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="wins"
              name="Vendas"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
