import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, LabelList,
} from 'recharts'
import {
  Calendar, Users as UsersIcon, DollarSign, Loader2, ChevronDown,
  Layers, GitBranch, Sparkles,
} from 'lucide-react'
import {
  format, addDays, startOfWeek, endOfWeek, startOfMonth, parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { usePlannerForecastByDono, type ForecastCard } from '@/hooks/analytics/usePlannerForecastByDono'
import { useFilterProfilesWithRole } from '@/hooks/analytics/useFilterOptions'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

type ViewMode = 'stacked' | 'grouped' | 'cumulative'
type WindowPreset = 'this_week' | 'next_7d' | 'next_14d' | 'next_30d' | 'custom'
type Granularity = 'day' | 'week' | 'month'
type GroupBy = 'planner' | 'origem' | 'stage'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#a855f7', '#ef4444', '#14b8a6', '#f97316',
  '#84cc16', '#06b6d4', '#d946ef', '#eab308', '#22c55e',
]

const ORIGEM_LABELS: Record<string, string> = {
  manual: 'Planner direto',
  whatsapp: 'WhatsApp',
  active_campaign: 'Active Campaign',
  mkt: 'Marketing',
  indicacao: 'Indicação',
  carteira_propria: 'Carteira própria',
  carteira_wg: 'Carteira WG',
  sorrento: 'Sorrento',
  weddings: 'Weddings',
  sem_origem: 'Sem origem',
}

function colorFor(index: number): string {
  return COLORS[index % COLORS.length]
}

function windowDates(preset: WindowPreset, customStart?: string, customEnd?: string): { start: string; end: string } {
  const today = new Date()
  switch (preset) {
    case 'this_week':
      return {
        start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        end: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      }
    case 'next_7d': return { start: format(today, 'yyyy-MM-dd'), end: format(addDays(today, 7), 'yyyy-MM-dd') }
    case 'next_14d': return { start: format(today, 'yyyy-MM-dd'), end: format(addDays(today, 14), 'yyyy-MM-dd') }
    case 'next_30d': return { start: format(today, 'yyyy-MM-dd'), end: format(addDays(today, 30), 'yyyy-MM-dd') }
    case 'custom':
      return {
        start: customStart || format(today, 'yyyy-MM-dd'),
        end: customEnd || format(addDays(today, 30), 'yyyy-MM-dd'),
      }
  }
}

function windowLabel(p: WindowPreset): string {
  switch (p) {
    case 'this_week': return 'Esta semana'
    case 'next_7d': return 'Próximos 7 dias'
    case 'next_14d': return 'Próximos 14 dias'
    case 'next_30d': return 'Próximos 30 dias'
    case 'custom': return 'Datas específicas'
  }
}

function formatCompact(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}mi`
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}k`
  return `R$ ${Math.round(v)}`
}

function bucketKey(dateStr: string, granularity: Granularity): { key: string; display: string; raw: string } {
  const d = parseISO(dateStr)
  switch (granularity) {
    case 'day':
      return { key: dateStr, display: format(d, 'dd MMM', { locale: ptBR }), raw: dateStr }
    case 'week': {
      const ws = startOfWeek(d, { weekStartsOn: 1 })
      const we = endOfWeek(d, { weekStartsOn: 1 })
      return {
        key: format(ws, 'yyyy-MM-dd'),
        display: `${format(ws, 'dd/MM')}–${format(we, 'dd/MM')}`,
        raw: format(ws, 'yyyy-MM-dd'),
      }
    }
    case 'month': {
      const ms = startOfMonth(d)
      return {
        key: format(ms, 'yyyy-MM'),
        display: format(ms, 'MMM/yy', { locale: ptBR }),
        raw: format(ms, 'yyyy-MM-dd'),
      }
    }
  }
}

function categoryFor(card: ForecastCard, groupBy: GroupBy): { id: string; nome: string } {
  switch (groupBy) {
    case 'planner': return { id: card.planner_id, nome: card.planner_nome }
    case 'origem': return { id: card.origem, nome: ORIGEM_LABELS[card.origem] ?? card.origem }
    case 'stage': return { id: card.stage_id ?? 'sem_stage', nome: card.stage_nome ?? 'Sem etapa' }
  }
}

interface ChartPoint {
  bucket: string
  bucketRaw: string
  total: number
  [categoryId: string]: number | string
}

interface Category {
  id: string
  nome: string
  color: string
  total: number
}

export default function PlannerForecastChart() {
  const drillDown = useDrillDownStore()
  const profiles = useFilterProfilesWithRole()
  const meta = useCurrentProductMeta()
  const stages = usePipelineStages(meta.pipelineId)

  const allPlanners = useMemo(() => (profiles.data ?? []).filter(p => p.role === 'vendas'), [profiles.data])
  const allStages = useMemo(() => (stages.data ?? []).filter((s) => (s as { ativo?: boolean }).ativo !== false), [stages.data])

  const [windowPreset, setWindowPreset] = useState<WindowPreset>('next_7d')
  const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'))
  const [selectedOwners, setSelectedOwners] = useState<string[]>([])
  const [selectedOrigens, setSelectedOrigens] = useState<string[]>([])
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [valueMin, setValueMin] = useState<string>('')
  const [valueMax, setValueMax] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>('stacked')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [groupBy, setGroupBy] = useState<GroupBy>('planner')

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
    origens: selectedOrigens,
    stageIds: selectedStages,
    valueMin: valueMinNum,
    valueMax: valueMaxNum,
  })

  const availableOrigens = useMemo(() => {
    if (!data) return []
    const set = new Set<string>()
    for (const c of data) set.add(c.origem)
    return Array.from(set).sort()
  }, [data])

  const { chartData, categories, totalGeral, totalQtd } = useMemo(() => {
    if (!data || data.length === 0) {
      return { chartData: [] as ChartPoint[], categories: [] as Category[], totalGeral: 0, totalQtd: 0 }
    }

    const catMap = new Map<string, { nome: string; total: number }>()
    for (const card of data) {
      const cat = categoryFor(card, groupBy)
      const existing = catMap.get(cat.id)
      if (existing) existing.total += card.valor
      else catMap.set(cat.id, { nome: cat.nome, total: card.valor })
    }
    const categories: Category[] = Array.from(catMap.entries())
      .map(([id, v], idx) => ({ id, nome: v.nome, color: colorFor(idx), total: v.total }))
      .sort((a, b) => b.total - a.total)

    const byBucket = new Map<string, ChartPoint>()
    let totalGeral = 0
    for (const card of data) {
      const { key, display, raw } = bucketKey(card.data_prevista, granularity)
      const cat = categoryFor(card, groupBy)
      const point = byBucket.get(key) ?? { bucket: display, bucketRaw: raw, total: 0 }
      point[cat.id] = (point[cat.id] as number | undefined ?? 0) + card.valor
      point.total = (point.total as number) + card.valor
      byBucket.set(key, point)
      totalGeral += card.valor
    }
    const chartData = Array.from(byBucket.values()).sort((a, b) => a.bucketRaw.localeCompare(b.bucketRaw))

    if (viewMode === 'cumulative') {
      let acc = 0
      for (const p of chartData) {
        acc += p.total as number
        p.total = acc
      }
    }

    return { chartData, categories, totalGeral, totalQtd: data.length }
  }, [data, groupBy, granularity, viewMode])

  const openCards = (categoryId: string, categoryNome: string, bucketRaw: string) => {
    const label = `${categoryNome} · ${bucketRaw}`
    if (groupBy === 'planner') {
      drillDown.open({ label, drillSource: 'current_stage', drillOwnerId: categoryId })
    } else if (groupBy === 'stage' && categoryId !== 'sem_stage') {
      drillDown.open({ label, drillSource: 'current_stage', drillStageId: categoryId })
    } else {
      drillDown.open({ label, drillSource: 'current_stage' })
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Previsão de fechamento</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalQtd} cards · {formatCurrency(totalGeral)} previstos {windowLabel(windowPreset)}
            {groupBy !== 'planner' && ` · agrupado por ${groupBy === 'origem' ? 'origem' : 'etapa atual'}`}
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

      {/* Linha 1: dimensões */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
          <Sparkles className="w-3 h-3" />
          Olhar
        </div>
        <div className="flex items-center gap-0.5 bg-slate-50 rounded-md p-0.5">
          {([
            ['planner', 'Por Planner'],
            ['origem', 'Por Origem'],
            ['stage', 'Por Etapa'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setGroupBy(v)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                groupBy === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 bg-slate-50 rounded-md p-0.5">
          {([
            ['day', 'Dia'],
            ['week', 'Semana'],
            ['month', 'Mês'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setGranularity(v)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                granularity === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Linha 2: filtros */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
          Filtrar
        </div>

        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900">{windowLabel(windowPreset)}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </summary>
          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            {(['this_week', 'next_7d', 'next_14d', 'next_30d'] as const).map(p => (
              <button key={p} type="button" onClick={() => setWindowPreset(p)}
                className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                  windowPreset === p && 'bg-indigo-50 text-indigo-700 font-medium')}>
                {windowLabel(p)}
              </button>
            ))}
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button type="button" onClick={() => setWindowPreset('custom')}
                className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                  windowPreset === 'custom' && 'bg-indigo-50 text-indigo-700 font-medium')}>
                Datas específicas
              </button>
              {windowPreset === 'custom' && (
                <div className="space-y-1 mt-1 px-1">
                  <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full px-2 py-1 text-xs border border-slate-200 rounded" />
                  <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full px-2 py-1 text-xs border border-slate-200 rounded" />
                </div>
              )}
            </div>
          </div>
        </details>

        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50">
            <UsersIcon className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900">
              {selectedOwners.length === 0 ? 'Todos Planners' : `${selectedOwners.length} planner${selectedOwners.length > 1 ? 's' : ''}`}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </summary>
          <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            <button type="button" onClick={() => setSelectedOwners([])}
              className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                selectedOwners.length === 0 && 'bg-indigo-50 text-indigo-700 font-medium')}>Todos</button>
            {allPlanners.map(p => {
              const selected = selectedOwners.includes(p.id)
              return (
                <button key={p.id} type="button"
                  onClick={() => setSelectedOwners(selected ? selectedOwners.filter(x => x !== p.id) : [...selectedOwners, p.id])}
                  className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between',
                    selected && 'bg-indigo-50 text-indigo-700')}>
                  <span className="truncate">{p.nome}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
        </details>

        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900">
              {selectedOrigens.length === 0 ? 'Todas origens' : `${selectedOrigens.length} origem${selectedOrigens.length > 1 ? 's' : ''}`}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </summary>
          <div className="absolute top-full left-0 mt-1 w-56 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            <button type="button" onClick={() => setSelectedOrigens([])}
              className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                selectedOrigens.length === 0 && 'bg-indigo-50 text-indigo-700 font-medium')}>Todas</button>
            {availableOrigens.map(o => {
              const selected = selectedOrigens.includes(o)
              return (
                <button key={o} type="button"
                  onClick={() => setSelectedOrigens(selected ? selectedOrigens.filter(x => x !== o) : [...selectedOrigens, o])}
                  className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between',
                    selected && 'bg-indigo-50 text-indigo-700')}>
                  <span className="truncate">{ORIGEM_LABELS[o] ?? o}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
        </details>

        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50">
            <GitBranch className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900">
              {selectedStages.length === 0 ? 'Todas etapas' : `${selectedStages.length} etapa${selectedStages.length > 1 ? 's' : ''}`}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </summary>
          <div className="absolute top-full left-0 mt-1 w-72 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            <button type="button" onClick={() => setSelectedStages([])}
              className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                selectedStages.length === 0 && 'bg-indigo-50 text-indigo-700 font-medium')}>Todas</button>
            {allStages.map(s => {
              const selected = selectedStages.includes(s.id)
              return (
                <button key={s.id} type="button"
                  onClick={() => setSelectedStages(selected ? selectedStages.filter(x => x !== s.id) : [...selectedStages, s.id])}
                  className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between',
                    selected && 'bg-indigo-50 text-indigo-700')}>
                  <span className="truncate">{s.nome}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
        </details>

        <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md">
          <DollarSign className="w-3.5 h-3.5 text-slate-400" />
          <input type="number" placeholder="Min" value={valueMin} onChange={e => setValueMin(e.target.value)}
            className="w-20 px-1 text-xs bg-transparent outline-none" />
          <span className="text-slate-400">a</span>
          <input type="number" placeholder="Max" value={valueMax} onChange={e => setValueMax(e.target.value)}
            className="w-20 px-1 text-xs bg-transparent outline-none" />
          {(valueMin || valueMax) && (
            <button type="button" onClick={() => { setValueMin(''); setValueMax('') }}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 ml-1">limpar</button>
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
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ left: 0, right: 30, top: 20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={formatCompact} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}>
              <LabelList dataKey="total" position="top" formatter={formatCompact as never}
                style={{ fontSize: 10, fontWeight: 600, fill: '#334155' }} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={chartData} margin={{ left: 0, right: 30, top: 30, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={formatCompact} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            {viewMode === 'stacked' ? (
              <>
                {categories.map((c, idx) => (
                  <Bar
                    key={c.id}
                    dataKey={c.id}
                    name={c.nome}
                    stackId="a"
                    fill={c.color}
                    cursor="pointer"
                    onClick={(d: { payload?: ChartPoint }) => { if (d?.payload) openCards(c.id, c.nome, d.payload.bucketRaw) }}
                  >
                    <LabelList
                      dataKey={c.id}
                      position="center"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content={(props: any) => {
                        const { x, y, width, height, value } = props
                        const v = Number(value)
                        if (!v || v === 0 || height < 18) return null
                        return (
                          <text
                            x={x + width / 2}
                            y={y + height / 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={10}
                            fontWeight={600}
                            fill="white"
                            style={{ pointerEvents: 'none' }}
                          >
                            {formatCompact(v)}
                          </text>
                        )
                      }}
                    />
                    {idx === categories.length - 1 && (
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={formatCompact as never}
                        style={{ fontSize: 11, fontWeight: 700, fill: '#0f172a' }}
                      />
                    )}
                  </Bar>
                ))}
              </>
            ) : (
              <>
                {categories.map(c => (
                  <Bar
                    key={c.id}
                    dataKey={c.id}
                    name={c.nome}
                    fill={c.color}
                    cursor="pointer"
                    radius={[4, 4, 0, 0]}
                    onClick={(d: { payload?: ChartPoint }) => { if (d?.payload) openCards(c.id, c.nome, d.payload.bucketRaw) }}
                  >
                    <LabelList dataKey={c.id} position="top" formatter={formatCompact as never}
                      style={{ fontSize: 10, fontWeight: 600, fill: '#334155' }} />
                  </Bar>
                ))}
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Legenda rica com valores escritos */}
      {categories.length > 0 && (
        <div className="border-t border-slate-100 pt-3 flex flex-wrap gap-2">
          {categories.slice(0, 12).map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => openCards(c.id, c.nome, 'período')}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border border-slate-200 hover:bg-slate-50"
            >
              <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
              <span className="text-slate-700 max-w-[160px] truncate">{c.nome}</span>
              <span className="text-slate-500 tabular-nums">{formatCurrency(c.total)}</span>
              <span className="text-slate-400 text-[10px]">
                {Math.round((c.total / totalGeral) * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
