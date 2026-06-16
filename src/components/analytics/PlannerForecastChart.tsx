import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, LabelList, Cell,
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
import { usePipelinePhases } from '@/hooks/usePipelinePhases'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { forecastToDrillRows } from '@/hooks/analytics/forecastToDrillRows'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

// Dimensão = o que vai no eixo X. 'tempo' = linha do tempo (por dia/semana/mês);
// 'planner'|'origem'|'stage' = uma barra por categoria (total previsto na janela).
type Dimensao = 'tempo' | 'planner' | 'origem' | 'stage'
type Categoria = Exclude<Dimensao, 'tempo'>
type WindowPreset = 'this_week' | 'next_7d' | 'next_14d' | 'next_30d' | 'custom'
type Granularity = 'day' | 'week' | 'month'

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

function dimensaoLabel(d: Dimensao): string {
  switch (d) {
    case 'tempo': return 'ao longo do tempo'
    case 'planner': return 'por consultor'
    case 'origem': return 'por origem'
    case 'stage': return 'por etapa'
  }
}

function formatCompact(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}mi`
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}k`
  return `R$ ${Math.round(v)}`
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
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

function categoryFor(card: ForecastCard, dim: Categoria): { id: string; nome: string } {
  switch (dim) {
    case 'planner': return { id: card.planner_id, nome: card.planner_nome }
    case 'origem': return { id: card.origem, nome: ORIGEM_LABELS[card.origem] ?? card.origem }
    case 'stage': return { id: card.stage_id ?? 'sem_stage', nome: card.stage_nome ?? 'Sem etapa' }
  }
}

interface TimePoint { bucket: string; bucketRaw: string; total: number }
interface CatPoint { id: string; nome: string; valor: number; qtd: number; color: string }

export default function PlannerForecastChart() {
  const drillDown = useDrillDownStore()
  const profiles = useFilterProfilesWithRole()
  const meta = useCurrentProductMeta()
  const stages = usePipelineStages(meta.pipelineId)
  const phases = usePipelinePhases(meta.pipelineId)

  // A previsão só conta cards na etapa de Planner (a fase cujo dono é o vendas_owner).
  // O filtro de etapas, portanto, só lista as etapas dessa fase.
  const plannerPhaseId = useMemo(
    () => (phases.data ?? []).find(ph => ph.owner_field === 'vendas_owner_id')?.id ?? null,
    [phases.data],
  )

  const allPlanners = useMemo(() => (profiles.data ?? []).filter(p => p.role === 'vendas'), [profiles.data])
  const allStages = useMemo(
    () => (stages.data ?? []).filter((s) =>
      (s as { ativo?: boolean }).ativo !== false
      && (!plannerPhaseId || s.phase_id === plannerPhaseId)),
    [stages.data, plannerPhaseId],
  )

  const [windowPreset, setWindowPreset] = useState<WindowPreset>('next_30d')
  const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'))
  const [selectedOwners, setSelectedOwners] = useState<string[]>([])
  const [selectedOrigens, setSelectedOrigens] = useState<string[]>([])
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [valueMin, setValueMin] = useState<string>('')
  const [valueMax, setValueMax] = useState<string>('')
  const [dimensao, setDimensao] = useState<Dimensao>('tempo')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [cumulative, setCumulative] = useState(false)

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

  const totalGeral = useMemo(() => (data ?? []).reduce((s, c) => s + c.valor, 0), [data])
  const totalQtd = data?.length ?? 0

  // Eixo = TEMPO (linha do tempo)
  const timeData = useMemo(() => {
    if (!data || data.length === 0) return [] as TimePoint[]
    const byBucket = new Map<string, TimePoint>()
    for (const card of data) {
      const { key, display, raw } = bucketKey(card.data_prevista, granularity)
      const point = byBucket.get(key) ?? { bucket: display, bucketRaw: raw, total: 0 }
      point.total += card.valor
      byBucket.set(key, point)
    }
    const arr = Array.from(byBucket.values()).sort((a, b) => a.bucketRaw.localeCompare(b.bucketRaw))
    if (cumulative) {
      let acc = 0
      for (const p of arr) { acc += p.total; p.total = acc }
    }
    return arr
  }, [data, granularity, cumulative])

  // Eixo = CATEGORIA (uma barra por consultor / origem / etapa)
  const catData = useMemo(() => {
    if (!data || data.length === 0 || dimensao === 'tempo') return [] as CatPoint[]
    const m = new Map<string, { id: string; nome: string; valor: number; qtd: number }>()
    for (const card of data) {
      const cat = categoryFor(card, dimensao)
      const cur = m.get(cat.id) ?? { id: cat.id, nome: cat.nome, valor: 0, qtd: 0 }
      cur.valor += card.valor; cur.qtd++
      m.set(cat.id, cur)
    }
    return Array.from(m.values())
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 20)
      .map((c, idx) => ({ ...c, color: colorFor(idx) }))
  }, [data, dimensao])

  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])

  // Clique numa barra de categoria (pessoa/origem/etapa): abre os cards EXATOS daquela fatia.
  const openCat = (id: string, nome: string) => {
    if (dimensao === 'tempo') return
    const cards = (data ?? []).filter(c => categoryFor(c, dimensao).id === id)
    const rows = forecastToDrillRows(cards, todayStr)
    const total = rows.reduce((s, r) => s + r.valor_display, 0)
    drillDown.open({
      label: nome,
      variant: 'forecast',
      contextIcon: dimensao === 'origem' ? '🔗' : dimensao === 'stage' ? '📊' : '👤',
      presetRows: rows,
      presetKey: `fc-${dimensao}-${id}`,
      summary: `${formatCurrency(total)} previsto · ${rows.length} card${rows.length !== 1 ? 's' : ''}`,
    })
  }

  // Clique numa barra do tempo: abre os cards previstos para aquele dia/semana/mês.
  const openBucket = (raw: string, display: string) => {
    const cards = (data ?? []).filter(c => bucketKey(c.data_prevista, granularity).raw === raw)
    const rows = forecastToDrillRows(cards, todayStr)
    const total = rows.reduce((s, r) => s + r.valor_display, 0)
    drillDown.open({
      label: `Previsão · ${display}`,
      variant: 'forecast',
      contextIcon: '📅',
      presetRows: rows,
      presetKey: `fc-time-${raw}`,
      summary: `${formatCurrency(total)} previsto · ${rows.length} card${rows.length !== 1 ? 's' : ''}`,
    })
  }

  const isTempo = dimensao === 'tempo'
  const hasData = isTempo ? timeData.length > 0 : catData.length > 0

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Previsão de fechamento</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalQtd} cards · {formatCurrency(totalGeral)} previstos {windowLabel(windowPreset)} · {dimensaoLabel(dimensao)} · só etapa Planner
          </p>
        </div>
        {isTempo && (
          <div className="flex items-center gap-0.5 bg-slate-50 rounded-md p-0.5">
            {([
              [false, 'Total'],
              [true, 'Acumulado'],
            ] as const).map(([v, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setCumulative(v)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                  cumulative === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Linha 1: o que vai no eixo (dimensão) + granularidade (só no tempo) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
          <Sparkles className="w-3 h-3" />
          Ver
        </div>
        <div className="flex items-center gap-0.5 bg-slate-50 rounded-md p-0.5">
          {([
            ['tempo', 'Por Tempo'],
            ['planner', 'Por Pessoa'],
            ['origem', 'Por Origem'],
            ['stage', 'Por Etapa'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setDimensao(v)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                dimensao === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {isTempo && (
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
        )}
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
      ) : !hasData ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-400">
          Sem cards com data prevista nesse período/filtro.
        </div>
      ) : isTempo ? (
        cumulative ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={timeData} margin={{ left: 0, right: 30, top: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={formatCompact} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="total" name="Acumulado" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}>
                <LabelList dataKey="total" position="top" formatter={formatCompact as never}
                  style={{ fontSize: 10, fontWeight: 600, fill: '#334155' }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={timeData} margin={{ left: 0, right: 30, top: 30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={formatCompact} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="total" name="Previsto" fill="#6366f1" radius={[4, 4, 0, 0]} cursor="pointer"
                onClick={(d: { payload?: TimePoint }) => { if (d?.payload?.bucketRaw) openBucket(d.payload.bucketRaw, d.payload.bucket) }}>
                <LabelList dataKey="total" position="top" formatter={formatCompact as never}
                  style={{ fontSize: 11, fontWeight: 700, fill: '#0f172a' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(260, catData.length * 38 + 40)}>
          <BarChart data={catData} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={formatCompact} />
            <YAxis
              type="category"
              dataKey="nome"
              width={140}
              tick={{ fontSize: 11, fill: '#334155' }}
              tickFormatter={(s: string) => truncate(s, 18)}
            />
            <Tooltip
              formatter={(v: number) => formatCurrency(v)}
              labelFormatter={(l: string) => l}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="valor" name="Previsto" radius={[0, 4, 4, 0]} cursor="pointer"
              onClick={(d: { payload?: CatPoint }) => { if (d?.payload) openCat(d.payload.id, d.payload.nome) }}>
              {catData.map(c => <Cell key={c.id} fill={c.color} />)}
              <LabelList dataKey="valor" position="right" formatter={formatCompact as never}
                style={{ fontSize: 11, fontWeight: 600, fill: '#334155' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {!isTempo && hasData && (
        <p className="text-[11px] text-slate-400 pt-1">
          Cada barra é o total previsto {dimensaoLabel(dimensao)} na janela selecionada. Clique numa barra pra ver os cards.
        </p>
      )}
    </div>
  )
}
