import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from 'recharts'
import { Calendar, Users as UsersIcon, DollarSign, Loader2, ChevronDown } from 'lucide-react'
import { format, addDays, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { usePlannerForecastByDono } from '@/hooks/analytics/usePlannerForecastByDono'
import { useFilterProfilesWithRole } from '@/hooks/analytics/useFilterOptions'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

type ViewMode = 'stacked' | 'grouped' | 'cumulative'
type WindowPreset = 'this_week' | 'next_7d' | 'next_14d' | 'next_30d' | 'custom'

// Paleta consistente (atribui cor estável por planner id)
const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#a855f7', '#ef4444', '#14b8a6', '#f97316',
  '#84cc16', '#06b6d4', '#d946ef', '#eab308', '#22c55e',
]

function colorFor(_id: string, index: number): string {
  return COLORS[index % COLORS.length]
}

function windowDates(preset: WindowPreset, customStart?: string, customEnd?: string): { start: string; end: string } {
  const today = new Date()
  switch (preset) {
    case 'this_week': {
      const start = startOfWeek(today, { weekStartsOn: 1 })
      const end = endOfWeek(today, { weekStartsOn: 1 })
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
    }
    case 'next_7d':
      return { start: format(today, 'yyyy-MM-dd'), end: format(addDays(today, 7), 'yyyy-MM-dd') }
    case 'next_14d':
      return { start: format(today, 'yyyy-MM-dd'), end: format(addDays(today, 14), 'yyyy-MM-dd') }
    case 'next_30d':
      return { start: format(today, 'yyyy-MM-dd'), end: format(addDays(today, 30), 'yyyy-MM-dd') }
    case 'custom':
      return {
        start: customStart || format(today, 'yyyy-MM-dd'),
        end: customEnd || format(addDays(today, 30), 'yyyy-MM-dd'),
      }
  }
}

interface ChartPoint {
  data: string  // formatted day
  dataRaw: string  // ISO
  total: number
  [plannerId: string]: number | string  // dynamic owner values
}

export default function PlannerForecastChart() {
  const drillDown = useDrillDownStore()
  const profiles = useFilterProfilesWithRole()

  // Lista de planners disponíveis (role=vendas)
  const allPlanners = useMemo(() => {
    return (profiles.data ?? []).filter(p => p.role === 'vendas')
  }, [profiles.data])

  // Filtros
  const [windowPreset, setWindowPreset] = useState<WindowPreset>('next_7d')
  const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'))
  const [selectedOwners, setSelectedOwners] = useState<string[]>([])  // [] = todos
  const [valueMin, setValueMin] = useState<string>('')
  const [valueMax, setValueMax] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>('stacked')

  // CRÍTICO: memoizar pra não recriar new Date() a cada render (causa loop infinito)
  const { start, end } = useMemo(
    () => windowDates(windowPreset, customStart, customEnd),
    [windowPreset, customStart, customEnd],
  )

  const valueMinNum = useMemo(() => (valueMin ? Number(valueMin) : null), [valueMin])
  const valueMaxNum = useMemo(() => (valueMax ? Number(valueMax) : null), [valueMax])

  const { data, isLoading } = usePlannerForecastByDono({
    dateStart: start,
    dateEnd: end,
    ownerIds: selectedOwners,
    valueMin: valueMinNum,
    valueMax: valueMaxNum,
  })

  // Agrupa por dia → ponto do gráfico com 1 coluna por planner
  const { chartData, plannersOnChart, totalGeral } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [] as ChartPoint[], plannersOnChart: [] as { id: string; nome: string; color: string; total: number }[], totalGeral: 0 }

    // Catálogo de planners que aparecem nesse range
    const plannerMap = new Map<string, { nome: string; total: number }>()
    for (const row of data) {
      const existing = plannerMap.get(row.planner_id)
      if (existing) existing.total += row.valor
      else plannerMap.set(row.planner_id, { nome: row.planner_nome, total: row.valor })
    }
    const plannersOnChart = Array.from(plannerMap.entries())
      .map(([id, v], idx) => ({ id, nome: v.nome, color: colorFor(id, idx), total: v.total }))
      .sort((a, b) => b.total - a.total)

    // Agrupa por dia
    const byDay = new Map<string, ChartPoint>()
    let totalGeral = 0
    for (const row of data) {
      const point = byDay.get(row.data_prevista) ?? {
        data: format(parseISO(row.data_prevista), "dd 'de' MMM", { locale: ptBR }),
        dataRaw: row.data_prevista,
        total: 0,
      }
      point[row.planner_id] = (point[row.planner_id] as number | undefined ?? 0) + row.valor
      point.total = (point.total as number) + row.valor
      byDay.set(row.data_prevista, point)
      totalGeral += row.valor
    }
    const chartData = Array.from(byDay.values()).sort((a, b) => a.dataRaw.localeCompare(b.dataRaw))

    // Cumulative — substitui valores por soma acumulada
    if (viewMode === 'cumulative') {
      let acc = 0
      for (const p of chartData) {
        acc += p.total as number
        p.total = acc
      }
    }

    return { chartData, plannersOnChart, totalGeral }
  }, [data, viewMode])

  const totalQtd = useMemo(() => data?.reduce((sum, r) => sum + r.qtd, 0) ?? 0, [data])

  const openCardsByDay = (point: ChartPoint, plannerId?: string) => {
    const label = plannerId
      ? `Previsto fechar em ${point.data}: ${plannersOnChart.find(p => p.id === plannerId)?.nome ?? ''}`
      : `Previsto fechar em ${point.data}`
    drillDown.open({
      label,
      drillSource: 'current_stage',
      drillOwnerId: plannerId,
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Previsão de fechamento</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalQtd} cards · {formatCurrency(totalGeral)} previstos {windowLabel(windowPreset)}
          </p>
        </div>
        <div className="flex items-center gap-0.5 bg-slate-50 rounded-md p-0.5">
          {([
            ['stacked', 'Empilhado'],
            ['grouped', 'Lado a lado'],
            ['cumulative', 'Acumulado'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setViewMode(v)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                viewMode === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Linha de filtros */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-100">
        {/* Janela temporal */}
        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900">{windowLabel(windowPreset)}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </summary>
          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            {(['this_week', 'next_7d', 'next_14d', 'next_30d'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setWindowPreset(p)}
                className={cn(
                  'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                  windowPreset === p && 'bg-indigo-50 text-indigo-700 font-medium',
                )}
              >
                {windowLabel(p)}
              </button>
            ))}
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button
                type="button"
                onClick={() => setWindowPreset('custom')}
                className={cn(
                  'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                  windowPreset === 'custom' && 'bg-indigo-50 text-indigo-700 font-medium',
                )}
              >
                Datas específicas
              </button>
              {windowPreset === 'custom' && (
                <div className="space-y-1 mt-1 px-1">
                  <input
                    type="date"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                  />
                  <input
                    type="date"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                  />
                </div>
              )}
            </div>
          </div>
        </details>

        {/* Planners */}
        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50">
            <UsersIcon className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900">
              {selectedOwners.length === 0 ? 'Todos os Planners' :
               selectedOwners.length === 1 ? '1 Planner' :
               `${selectedOwners.length} Planners`}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </summary>
          <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            <button
              type="button"
              onClick={() => setSelectedOwners([])}
              className={cn(
                'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                selectedOwners.length === 0 && 'bg-indigo-50 text-indigo-700 font-medium',
              )}
            >
              Todos
            </button>
            {allPlanners.map(p => {
              const selected = selectedOwners.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (selected) setSelectedOwners(selectedOwners.filter(x => x !== p.id))
                    else setSelectedOwners([...selectedOwners, p.id])
                  }}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between',
                    selected && 'bg-indigo-50 text-indigo-700',
                  )}
                >
                  <span className="truncate">{p.nome}</span>
                  {selected && <span className="text-indigo-600">✓</span>}
                </button>
              )
            })}
          </div>
        </details>

        {/* Faixa de valor */}
        <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md">
          <DollarSign className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500">R$</span>
          <input
            type="number"
            placeholder="Min"
            value={valueMin}
            onChange={e => setValueMin(e.target.value)}
            className="w-20 px-1 text-xs bg-transparent outline-none"
          />
          <span className="text-slate-400">a</span>
          <input
            type="number"
            placeholder="Max"
            value={valueMax}
            onChange={e => setValueMax(e.target.value)}
            className="w-20 px-1 text-xs bg-transparent outline-none"
          />
          {(valueMin || valueMax) && (
            <button
              type="button"
              onClick={() => { setValueMin(''); setValueMax('') }}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 ml-1"
            >
              limpar
            </button>
          )}
        </div>
      </div>

      {/* Gráfico */}
      {isLoading ? (
        <div className="h-72 flex items-center justify-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-400">
          Sem cards com data prevista nesse período/filtro.
        </div>
      ) : viewMode === 'cumulative' ? (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={v => formatCurrency(v).replace('R$ ', '')} />
            <Tooltip
              formatter={(v: number) => formatCurrency(v)}
              labelFormatter={(label) => `${label} (acumulado)`}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={v => formatCurrency(v).replace('R$ ', '')} />
            <Tooltip
              formatter={(v: number) => formatCurrency(v)}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {plannersOnChart.map(p => (
              <Bar
                key={p.id}
                dataKey={p.id}
                name={p.nome}
                stackId={viewMode === 'stacked' ? 'a' : undefined}
                fill={p.color}
                cursor="pointer"
                onClick={(d: { payload?: ChartPoint }) => { if (d?.payload) openCardsByDay(d.payload, p.id) }}
                radius={viewMode === 'stacked' ? 0 : [4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Sumário da janela */}
      {plannersOnChart.length > 0 && (
        <div className="border-t border-slate-100 pt-3 flex flex-wrap gap-2">
          {plannersOnChart.slice(0, 8).map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => drillDown.open({
                label: `Previsto de ${p.nome} (${windowLabel(windowPreset)})`,
                drillSource: 'current_stage',
                drillOwnerId: p.id,
              })}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border border-slate-200 hover:bg-slate-50"
            >
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span className="text-slate-700">{p.nome}</span>
              <span className="text-slate-500 tabular-nums">{formatCurrency(p.total)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function windowLabel(preset: WindowPreset): string {
  switch (preset) {
    case 'this_week': return 'Esta semana'
    case 'next_7d': return 'Próximos 7 dias'
    case 'next_14d': return 'Próximos 14 dias'
    case 'next_30d': return 'Próximos 30 dias'
    case 'custom': return 'Datas específicas'
  }
}
