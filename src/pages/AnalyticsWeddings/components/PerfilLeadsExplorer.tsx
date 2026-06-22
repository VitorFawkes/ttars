import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts'
import {
  useWwPerfilTemporal, useWwFunilRanking,
  type WwPerfilDim, type WwPerfilMarco, type WwPerfilGran, type WwPerfilCategoria, type WwPerfilTemporal,
  type WwFunilRankingRow,
} from '@/hooks/analyticsWeddings/useWw2'
import type { AppliedFilters } from './FilterBar'
import type { DrillContext } from './DrillDrawer'
import { SectionCard, EmptyState, LoadingSkeleton } from './ui'
import { formatNumber } from '../lib/format'

// "Perfil dos leads" — QUEM são os leads (cidade/destino, investimento, convidados do
// formulário + origem de marketing e tipo) e como o perfil se comporta: AO LONGO DO TEMPO
// (dia/semana/mês, empilhado ou lado a lado, em quantidade ou participação %), num FUNIL
// POR CATEGORIA, e em CRUZAMENTO de duas dimensões. Recortável por etapa do funil, por
// quais buckets mostrar, e por todos os filtros do topo. Fontes: ww_perfil_temporal +
// ww_funil_ranking_combo.

type Dim = WwPerfilDim
const DIM_OPTS: { id: Dim; label: string }[] = [
  { id: 'destino', label: 'Cidade / destino' },
  { id: 'faixa', label: 'Investimento' },
  { id: 'convidados', label: 'Convidados' },
  { id: 'origem', label: 'Origem (marketing)' },
  { id: 'tipo', label: 'Tipo' },
]
const DIM_LABEL: Record<Dim, string> = {
  destino: 'Cidade / destino', faixa: 'Investimento', convidados: 'Convidados', origem: 'Origem', tipo: 'Tipo',
}
const FORM_DIMS: Dim[] = ['destino', 'faixa', 'convidados']

const STAGE_OPTS: { id: WwPerfilMarco; label: string }[] = [
  { id: 'entrou', label: 'Entraram' },
  { id: 'fez_sdr', label: 'Fizeram 1ª reunião' },
  { id: 'marcou_closer', label: 'Marcaram closer' },
  { id: 'fez_closer', label: 'Fizeram closer' },
  { id: 'ganho', label: 'Fecharam' },
]
const STAGE_LABEL = (m: WwPerfilMarco) => STAGE_OPTS.find(s => s.id === m)!.label

const ORDER: Partial<Record<Dim, string[]>> = {
  faixa: ['Até R$50 mil', 'R$50-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil'],
  convidados: ['Apenas o casal', 'Até 20', '20-50', '50-100', '50-80', '80-100', '+100'],
  // ordem fixa dos destinos (pedido do Vitor); os demais seguem por volume, "Outros"/sem info no fim
  destino: ['Caribe', 'Nordeste', 'Itália', 'Mendoza'],
}
const isNI = (b: string) => /n[ãa]o\s*informad/i.test(b) || b === 'Desconhecida'

const PALETA = ['#BD965C', '#874B52', '#A8B5A2', '#C9A66B', '#6E7F80', '#B07C9E', '#7C9885', '#9B8281', '#CBB994', '#7D8CA3', '#C98B6B', '#5E8B7E']
const COR_OUTROS = '#cbd5e1'
const corBucket = (bucket: string, i: number) => (bucket === 'Outros' ? COR_OUTROS : PALETA[i % PALETA.length])

function ordenarBuckets(dim: Dim, buckets: string[], peso: (b: string) => number): string[] {
  const order = ORDER[dim]
  const arr = [...buckets]
  if (order) arr.sort((a, b) => ((order.indexOf(a) + 1) || 999) - ((order.indexOf(b) + 1) || 999))
  else arr.sort((a, b) => peso(b) - peso(a))
  // sempre por último: "Não informado" e depois o agregado "Outros"
  const trail = (b: string) => (b === 'Outros' ? 2 : isNI(b) ? 1 : 0)
  arr.sort((a, b) => trail(a) - trail(b))
  return arr
}

const drillBucket = (dim: Dim, bucket: string): Partial<DrillContext> => {
  const v = isNI(bucket) ? 'Não informado' : bucket
  if (dim === 'destino') return { destino: v }
  if (dim === 'faixa') return { faixa: v }
  if (dim === 'convidados') return { convidados: v }
  if (dim === 'origem') return { origem: v }
  return { tipo: v }
}

// Janela de datas de um período do gráfico (início do bucket → fim), recortada ao filtro.
function periodWindow(periodo: string, gran: WwPerfilGran, clampStart: string, clampEnd: string): { start: string; end: string } {
  const [y, m, d] = periodo.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
  let end: Date
  if (gran === 'day') end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59))
  else if (gran === 'week') { end = new Date(start); end.setUTCDate(end.getUTCDate() + 6); end.setUTCHours(23, 59, 59) }
  else end = new Date(Date.UTC(y, m, 0, 23, 59, 59)) // último dia do mês
  const cs = new Date(clampStart), ce = new Date(clampEnd)
  const s = start < cs ? cs : start
  const e = end > ce ? ce : end
  return { start: s.toISOString(), end: e.toISOString() }
}

// Rótulo do valor de cada fatia/coluna (dentro no empilhado, em cima no lado a lado).
function makeSegLabel(measure: 'qtd' | 'pct', layout: 'stack' | 'group') {
  return function Seg(props: unknown) {
    const p = props as { x?: number; y?: number; width?: number; height?: number; value?: number }
    const v = Number(p.value ?? 0)
    if (!v) return null
    const txt = measure === 'pct' ? `${v}%` : formatNumber(v)
    if (layout === 'stack') {
      if ((p.height ?? 0) < 14 || (p.width ?? 0) < 18) return null
      return (
        <text x={(p.x ?? 0) + (p.width ?? 0) / 2} y={(p.y ?? 0) + (p.height ?? 0) / 2}
          fill="#fff" fontSize={10} fontWeight={600} textAnchor="middle" dominantBaseline="central">{txt}</text>
      )
    }
    if ((p.width ?? 0) < 8) return null
    return (
      <text x={(p.x ?? 0) + (p.width ?? 0) / 2} y={(p.y ?? 0) - 3} fill="#475569" fontSize={9} fontWeight={600} textAnchor="middle">{txt}</text>
    )
  }
}
// Total da pilha, acima da barra (só no empilhado em quantidade).
function makeTotalLabel(totals: number[]) {
  return function Total(props: unknown) {
    const p = props as { x?: number; y?: number; width?: number; index?: number }
    const t = totals[p.index ?? -1] ?? 0
    if (!t) return <g />
    return (
      <text x={(p.x ?? 0) + (p.width ?? 0) / 2} y={(p.y ?? 0) - 5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#475569">{formatNumber(t)}</text>
    )
  }
}

type View = 'tempo' | 'tabela' | 'cruz'
const VIEW_OPTS: { id: View; label: string }[] = [
  { id: 'tempo', label: 'Ao longo do tempo' },
  { id: 'tabela', label: 'Por categoria' },
  { id: 'cruz', label: 'Cruzamento' },
]

type Props = {
  filters: AppliedFilters
  baseCtx: Partial<DrillContext>
  onDrill: (ctx: DrillContext) => void
}

export function PerfilLeadsExplorer({ filters, baseCtx, onDrill }: Props) {
  const [dim, setDim] = useState<Dim>('destino')
  const [marco, setMarco] = useState<WwPerfilMarco>('entrou')
  const [view, setView] = useState<View>('tempo')
  const [granUser, setGranUser] = useState<WwPerfilGran | null>(null)
  const [layout, setLayout] = useState<'stack' | 'group'>('stack')
  const [measure, setMeasure] = useState<'qtd' | 'pct'>('qtd')
  const [sel, setSel] = useState<string[] | null>(null) // buckets escolhidos (null = top padrão)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [cruzY, setCruzY] = useState<Dim>('faixa')

  const stageLabel = STAGE_LABEL(marco)
  const isForm = FORM_DIMS.includes(dim)

  // granularidade segue o tamanho do período, a menos que o usuário fixe uma.
  const spanDays = useMemo(() => {
    const a = new Date(filters.dateStart).getTime(), b = new Date(filters.dateEnd).getTime()
    return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
  }, [filters.dateStart, filters.dateEnd])
  const autoGran: WwPerfilGran = spanDays <= 31 ? 'day' : spanDays <= 120 ? 'week' : 'month'
  const gran = granUser ?? autoGran

  const temporal = useWwPerfilTemporal({
    dateStart: filters.dateStart, dateEnd: filters.dateEnd, dateMode: filters.dateMode,
    dim, marco, granularidade: gran, buckets: sel && sel.length ? sel : undefined,
    origins: filters.origins, tipos: filters.tipos, consultorIds: filters.consultorIds,
    faixas: filters.faixas, convidados: filters.convidados, destinos: filters.destinos,
    canalSdr: filters.canalSdr, canalCloser: filters.canalCloser, statusLead: filters.statusLead,
  })

  const cruzX: Dim = isForm ? dim : 'destino'
  const cruzYsafe: Dim = cruzY === cruzX ? (FORM_DIMS.find(d => d !== cruzX) ?? 'faixa') : cruzY
  const ranking = useWwFunilRanking({
    dateStart: filters.dateStart, dateEnd: filters.dateEnd, dateMode: filters.dateMode,
    dimensoes: view === 'cruz' ? [cruzX as 'destino' | 'faixa' | 'convidados', cruzYsafe as 'destino' | 'faixa' | 'convidados'] : [],
    origins: filters.origins, tipos: filters.tipos, consultorIds: filters.consultorIds,
    canalSdr: filters.canalSdr, canalCloser: filters.canalCloser,
    faixas: filters.faixas, convidados: filters.convidados, destinos: filters.destinos,
    statusLead: filters.statusLead,
  })

  const totalMarco = temporal.data?.total_marco ?? 0
  const bucketsAll = temporal.data?.buckets_all ?? []
  const selCount = sel?.length ?? 0

  const trocaDim = (d: Dim) => { setDim(d); setSel(null); setPickerOpen(false); if (!FORM_DIMS.includes(d) && view === 'cruz') setView('tempo') }

  // Clique numa barra do gráfico → casais daquele período + categoria + etapa.
  const onBarClick = (bucket: string, periodo: string, label: string) => {
    const { start, end } = periodWindow(periodo, gran, filters.dateStart, filters.dateEnd)
    onDrill({ ...baseCtx, dateStart: start, dateEnd: end, dateMode: filters.dateMode, marco, ...drillBucket(dim, bucket), title: `${stageLabel} — ${DIM_LABEL[dim]}: ${bucket} · ${label}` } as DrillContext)
  }

  return (
    <SectionCard
      title="Perfil dos leads: quem são"
      subtitle="O que o casal declara no formulário (cidade, investimento, convidados) + origem de marketing e tipo. Veja a composição ao longo do tempo, o funil por categoria e o cruzamento de duas dimensões — na etapa que quiser, escolhendo quais categorias mostrar. Use os filtros do topo (origem, consultor, período) pra olhar de ângulos diferentes. Clique pra ver os casais."
    >
      {/* Controles compartilhados */}
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap mb-3">
        <div className="inline-flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-400">Ver por</span>
          <select value={dim} onChange={e => trocaDim(e.target.value as Dim)}
            className="px-2.5 py-1.5 text-sm font-medium bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors">
            {DIM_OPTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-400">Etapa</span>
          <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 flex-wrap">
            {STAGE_OPTS.map(s => (
              <button key={s.id} onClick={() => setMarco(s.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${marco === s.id ? 'bg-white text-ww-gold-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
          {VIEW_OPTS.map(v => {
            const disabled = v.id === 'cruz' && !isForm
            return (
              <button key={v.id} disabled={disabled} onClick={() => setView(v.id)}
                title={disabled ? 'Cruzamento vale para cidade, investimento e convidados' : undefined}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${view === v.id ? 'bg-white text-ww-gold-ink shadow-sm' : disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-700'}`}>
                {v.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Seletor de buckets (tempo e tabela) */}
      {view !== 'cruz' && bucketsAll.length > 0 && (
        <div className="mb-3">
          <button onClick={() => setPickerOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk transition-colors">
            <span className="text-slate-400">{DIM_LABEL[dim]}:</span>
            {selCount > 0 ? <span className="text-ww-gold-ink">{selCount} escolhida{selCount === 1 ? '' : 's'}</span> : <span>Mais comuns (top {temporal.data?.buckets_top.filter(b => b !== 'Outros').length ?? 8})</span>}
            <span className="text-slate-400">{pickerOpen ? '▾' : '▸'}</span>
          </button>
          {pickerOpen && (
            <div className="mt-2 p-3 bg-white border border-ww-sand rounded-xl shadow-ww-lift">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">Escolher {DIM_LABEL[dim].toLowerCase()}s</span>
                <span className="flex-1" />
                <button onClick={() => setSel(bucketsAll.map(b => b.bucket))} className="text-[11px] text-ww-gold-ink hover:underline">Todas</button>
                <button onClick={() => setSel(null)} className="text-[11px] text-slate-500 hover:underline">Padrão (mais comuns)</button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                {bucketsAll.map(b => {
                  const checked = sel ? sel.includes(b.bucket) : false
                  return (
                    <button key={b.bucket}
                      onClick={() => setSel(prev => {
                        const cur = prev ?? []
                        return cur.includes(b.bucket) ? cur.filter(x => x !== b.bucket) : [...cur, b.bucket]
                      })}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition ${checked ? 'bg-ww-gold-soft border-ww-gold text-ww-gold-ink' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      <span className={`w-3 h-3 rounded-[3px] border flex items-center justify-center ${checked ? 'bg-ww-gold border-ww-gold text-white' : 'border-slate-300'}`}>{checked ? '✓' : ''}</span>
                      <span className={isNI(b.bucket) ? 'italic text-slate-400' : ''}>{b.bucket}</span>
                      <span className="text-slate-400 tabular-nums">{formatNumber(b.total)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-controles da visão tempo */}
      {view === 'tempo' && (
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <span className="text-xs text-slate-500">
            <strong className="text-slate-700 tabular-nums">{formatNumber(totalMarco)}</strong> {stageLabel.toLowerCase()} no período
            {filters.dateMode === 'cohort' ? ' · pela data de entrada' : ' · pela data do evento'}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {(['day', 'week', 'month'] as const).map(g => (
                <button key={g} onClick={() => setGranUser(g)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${gran === g ? 'bg-white text-ww-gold-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {g === 'day' ? 'Dia' : g === 'week' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setLayout('stack')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${layout === 'stack' ? 'bg-white text-ww-gold-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Empilhado</button>
              <button onClick={() => setLayout('group')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${layout === 'group' ? 'bg-white text-ww-gold-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Lado a lado</button>
            </div>
            <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setMeasure('qtd')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${measure === 'qtd' ? 'bg-white text-ww-gold-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Quantidade</button>
              <button onClick={() => setMeasure('pct')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${measure === 'pct' ? 'bg-white text-ww-gold-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Participação %</button>
            </div>
          </div>
        </div>
      )}
      {view === 'cruz' && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-medium text-slate-400">Cruzar</span>
          <span className="px-2.5 py-1 text-xs font-medium bg-ww-cream text-ww-gold-ink rounded-lg">{DIM_LABEL[cruzX]}</span>
          <span className="text-xs text-slate-400">×</span>
          <select value={cruzYsafe} onChange={e => setCruzY(e.target.value as Dim)}
            className="px-2.5 py-1.5 text-xs font-medium bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors">
            {FORM_DIMS.filter(d => d !== cruzX).map(d => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
          </select>
          <span className="text-[11px] text-slate-400">· {stageLabel.toLowerCase()}</span>
        </div>
      )}

      {/* Corpo */}
      {view === 'tempo' && (
        temporal.isLoading ? <LoadingSkeleton rows={5} />
          : totalMarco === 0 ? <EmptyState message="Sem leads nessa etapa pra esse recorte. Amplie o período ou tire filtros." />
          : <TempoChart temporal={temporal.data!} dim={dim} layout={layout} measure={measure} selecionado={selCount > 0} onBarClick={onBarClick} />
      )}
      {view === 'tabela' && (
        temporal.isLoading ? <LoadingSkeleton rows={6} />
          : (temporal.data?.por_categoria.length ?? 0) === 0 ? <EmptyState message="Sem leads no período pra esse recorte." />
          : <CategoriaTabela
              cats={temporal.data!.por_categoria} dim={dim} marco={marco} sel={sel}
              onRowClick={(b) => onDrill({ ...baseCtx, marco, ...drillBucket(dim, b), title: `${stageLabel} — ${DIM_LABEL[dim]}: ${b}` } as DrillContext)}
            />
      )}
      {view === 'cruz' && (
        ranking.isLoading ? <LoadingSkeleton rows={5} />
          : <CruzMatriz
              rows={ranking.data?.rows ?? []} dimX={cruzX as 'destino' | 'faixa' | 'convidados'} dimY={cruzYsafe as 'destino' | 'faixa' | 'convidados'} marco={marco}
              onCellClick={(bx, by) => onDrill({ ...baseCtx, marco, ...drillBucket(cruzX, bx), ...drillBucket(cruzYsafe, by), title: `${stageLabel} — ${bx} + ${by}` } as DrillContext)}
            />
      )}
    </SectionCard>
  )
}

// ── Visão 1: composição AO LONGO DO TEMPO (empilhado/lado a lado, qtd/%) ────────
function TempoChart({ temporal, dim, layout, measure, selecionado, onBarClick }: {
  temporal: WwPerfilTemporal
  dim: Dim
  layout: 'stack' | 'group'
  measure: 'qtd' | 'pct'
  selecionado: boolean
  onBarClick: (bucket: string, periodo: string, label: string) => void
}) {
  const hasOutros = !selecionado && temporal.series.some(s => s.bucket === 'Outros')
  const totalsByBucket = new Map(temporal.buckets_all.map(b => [b.bucket, b.total]))
  const stackKeys = ordenarBuckets(dim, [...temporal.buckets_top.filter(b => b !== 'Outros'), ...(hasOutros ? ['Outros'] : [])], b => totalsByBucket.get(b) ?? 0)

  const ordem: { periodo: string; label: string }[] = []
  const vistos = new Set<string>()
  for (const s of temporal.series) if (!vistos.has(s.periodo)) { vistos.add(s.periodo); ordem.push({ periodo: s.periodo, label: s.label }) }
  const rowMap = new Map<string, Record<string, number | string>>()
  for (const p of ordem) {
    const row: Record<string, number | string> = { label: p.label, periodo: p.periodo }
    for (const k of stackKeys) row[k] = 0
    rowMap.set(p.periodo, row)
  }
  for (const s of temporal.series) {
    const r = rowMap.get(s.periodo)
    if (r && (stackKeys.includes(s.bucket))) r[s.bucket] = s.n
  }
  let data = ordem.map(p => rowMap.get(p.periodo)!)
  const totals = data.map(row => stackKeys.reduce((s, k) => s + (Number(row[k]) || 0), 0))
  if (measure === 'pct') {
    data = data.map((row, idx) => {
      const tot = totals[idx]
      const r: Record<string, number | string> = { label: row.label as string, periodo: row.periodo as string }
      for (const k of stackKeys) r[k] = tot > 0 ? Math.round(((Number(row[k]) || 0) / tot) * 1000) / 10 : 0
      return r
    })
  }

  const fmtTip = (v: number | string) => measure === 'pct' ? `${v}%` : formatNumber(Number(v))
  const segLabel = makeSegLabel(measure, layout)
  const totalLabel = makeTotalLabel(totals)
  const clickable = (k: string) => k !== 'Outros'

  return (
    <div>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} margin={{ top: 18, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false}
            domain={measure === 'pct' ? [0, 100] : undefined} tickFormatter={measure === 'pct' ? (v) => `${v}%` : undefined} />
          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} formatter={(v) => fmtTip(v as number)} cursor={{ fill: 'rgba(189,150,92,0.06)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {stackKeys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId={layout === 'stack' ? 'a' : undefined} fill={corBucket(k, i)} maxBarSize={layout === 'group' ? 18 : 44}
              cursor={clickable(k) ? 'pointer' : 'default'}
              onClick={clickable(k) ? ((d: unknown) => {
                const pl = (d as { payload?: { periodo?: string; label?: string } })?.payload
                if (pl?.periodo) onBarClick(k, pl.periodo, String(pl.label ?? ''))
              }) : undefined}
              radius={layout === 'stack' && i === stackKeys.length - 1 ? [3, 3, 0, 0] : layout === 'group' ? [2, 2, 0, 0] : undefined}>
              <LabelList dataKey={k} content={segLabel} />
              {measure === 'qtd' && layout === 'stack' && i === stackKeys.length - 1 && <LabelList content={totalLabel} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 mt-1">
        {layout === 'stack' ? 'Cada barra = um período, fatiada' : 'Cada período = colunas lado a lado'} pelas {DIM_LABEL[dim].toLowerCase()}s
        {selecionado ? ' escolhidas' : ' mais comuns (as demais somam em "Outros")'}.
        {measure === 'pct' ? ' Em participação % (mostra a mudança de mix mesmo quando o volume oscila).' : ' Em quantidade de casais.'}
        {' '}<strong className="text-slate-500">Clique numa fatia</strong> pra ver os casais daquele período. Troque a etapa lá em cima pra ver entradas, reuniões ou fechamentos.
      </p>
    </div>
  )
}

// ── Visão 2: funil POR CATEGORIA (tabela inteligente) ──────────────────────────
const TAB_COLS: { key: keyof WwPerfilCategoria; label: string; marco: WwPerfilMarco }[] = [
  { key: 'entrou', label: 'Entraram', marco: 'entrou' },
  { key: 'fez_sdr', label: '1ª reunião', marco: 'fez_sdr' },
  { key: 'marcou_closer', label: 'Marcou closer', marco: 'marcou_closer' },
  { key: 'fez_closer', label: 'Fez closer', marco: 'fez_closer' },
  { key: 'ganho', label: 'Fecharam', marco: 'ganho' },
]
function corTaxa(p: number | null): string {
  if (p == null) return 'text-slate-400'
  if (p >= 5) return 'text-emerald-700'
  if (p >= 2) return 'text-emerald-600'
  if (p >= 1) return 'text-amber-600'
  return 'text-slate-500'
}
function CategoriaTabela({ cats, dim, marco, sel, onRowClick }: {
  cats: WwPerfilCategoria[]
  dim: Dim
  marco: WwPerfilMarco
  sel: string[] | null
  onRowClick: (bucket: string) => void
}) {
  const filtradas = sel && sel.length ? cats.filter(c => sel.includes(c.bucket)) : cats
  const ordenadas = ordenarBuckets(dim, filtradas.map(c => c.bucket), b => filtradas.find(c => c.bucket === b)?.entrou ?? 0)
    .map(b => filtradas.find(c => c.bucket === b)!).filter(Boolean)
  const maxEntrou = Math.max(1, ...ordenadas.map(c => c.entrou))

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-slate-500 sticky left-0 bg-slate-50 z-10">{DIM_LABEL[dim]}</th>
            {TAB_COLS.map(c => (
              <th key={c.key} className={`px-3 py-2 text-right font-medium ${c.marco === marco ? 'text-ww-gold-ink' : 'text-slate-500'}`}>{c.label}</th>
            ))}
            <th className="px-3 py-2 text-right font-medium text-slate-500">Taxa</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(c => (
            <tr key={c.bucket} onClick={() => onRowClick(c.bucket)}
              className="border-t border-slate-100 hover:bg-ww-cream/40 cursor-pointer transition-colors group">
              <td className="px-3 py-2 sticky left-0 bg-white group-hover:bg-ww-cream/40 z-10">
                <div className={`font-medium truncate max-w-[180px] ${isNI(c.bucket) ? 'text-slate-400 italic' : 'text-slate-800 group-hover:text-ww-gold-ink'}`} title={c.bucket}>{c.bucket}</div>
                <div className="mt-1 h-1.5 bg-ww-cream rounded-full overflow-hidden w-28">
                  <div className="h-full bg-ww-gold/80 rounded-full" style={{ width: `${Math.max(3, (c.entrou / maxEntrou) * 100)}%` }} />
                </div>
              </td>
              {TAB_COLS.map(col => (
                <td key={col.key} className={`px-3 py-2 text-right tabular-nums ${col.marco === marco ? 'font-semibold text-ww-gold-ink bg-ww-cream/30' : 'text-slate-700'}`}>
                  {formatNumber(c[col.key] as number)}
                </td>
              ))}
              <td className={`px-3 py-2 text-right tabular-nums font-medium ${corTaxa(c.taxa_pct)}`}>
                {c.taxa_pct != null ? `${c.taxa_pct}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-400 px-3 py-2 border-t border-slate-100">
        Cada linha é uma {DIM_LABEL[dim].toLowerCase()}: quantos leads entraram e até onde foram no funil · Taxa = % que fechou. Coluna destacada = etapa escolhida. Clique numa linha pra ver os casais.
      </p>
    </div>
  )
}

// ── Visão 3: CRUZAMENTO de duas dimensões (heatmap de volume) ──────────────────
const bucketOfRow = (r: WwFunilRankingRow, d: 'destino' | 'faixa' | 'convidados'): string =>
  (d === 'destino' ? r.destino : d === 'faixa' ? r.faixa : r.convidados) ?? r.label ?? 'Não informado'
const countAtRow = (r: WwFunilRankingRow, m: WwPerfilMarco): number =>
  m === 'entrou' ? r.entrou : m === 'fez_sdr' ? r.fez_sdr : m === 'marcou_closer' ? r.marcou_closer : m === 'fez_closer' ? r.fez_closer : r.ganho

function corVolume(n: number, max: number): string {
  if (n === 0) return 'bg-slate-50 text-slate-300'
  const r = max > 0 ? n / max : 0
  if (r >= 0.66) return 'bg-ww-gold text-white'
  if (r >= 0.33) return 'bg-ww-gold-soft text-ww-gold-ink'
  return 'bg-ww-cream text-ww-n700'
}

function CruzMatriz({ rows, dimX, dimY, marco, onCellClick }: {
  rows: WwFunilRankingRow[]
  dimX: 'destino' | 'faixa' | 'convidados'
  dimY: 'destino' | 'faixa' | 'convidados'
  marco: WwPerfilMarco
  onCellClick: (bx: string, by: string) => void
}) {
  const cell = new Map<string, number>()
  const somaX = new Map<string, number>()
  const somaY = new Map<string, number>()
  for (const r of rows) {
    const bx = bucketOfRow(r, dimX), by = bucketOfRow(r, dimY), n = countAtRow(r, marco)
    if (n <= 0) continue
    cell.set(`${bx}|${by}`, (cell.get(`${bx}|${by}`) ?? 0) + n)
    somaX.set(bx, (somaX.get(bx) ?? 0) + n)
    somaY.set(by, (somaY.get(by) ?? 0) + n)
  }
  const xs = ordenarBuckets(dimX, [...somaX.keys()], b => somaX.get(b) ?? 0)
  const ys = ordenarBuckets(dimY, [...somaY.keys()], b => somaY.get(b) ?? 0)
  const max = Math.max(1, ...[...cell.values()])

  if (xs.length === 0 || ys.length === 0) {
    return <EmptyState message="Sem combinações com dados nesse recorte." />
  }

  return (
    <div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
        <table className="w-full text-xs border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-slate-400 sticky left-0 bg-white z-10 whitespace-nowrap">{DIM_LABEL[dimY]} ↓ / {DIM_LABEL[dimX]} →</th>
              {xs.map(x => (
                <th key={x} className="px-2 py-1.5 text-center font-medium text-slate-600 min-w-[76px]">
                  <div className="truncate max-w-[120px] mx-auto" title={x}>{x}</div>
                  <div className="text-[10px] text-slate-400 tabular-nums">{formatNumber(somaX.get(x) ?? 0)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ys.map(y => (
              <tr key={y}>
                <td className="px-2 py-1.5 text-slate-800 font-medium whitespace-nowrap sticky left-0 bg-white z-10">
                  <span className="truncate inline-block max-w-[140px] align-middle" title={y}>{y}</span>
                  <span className="text-[10px] text-slate-400 tabular-nums ml-1">{formatNumber(somaY.get(y) ?? 0)}</span>
                </td>
                {xs.map(x => {
                  const n = cell.get(`${x}|${y}`) ?? 0
                  return (
                    <td key={x} className="p-0 align-middle">
                      {n > 0 ? (
                        <button onClick={() => onCellClick(x, y)}
                          className={`w-full h-full px-2 py-2 text-center rounded tabular-nums font-semibold cursor-pointer hover:ring-2 hover:ring-ww-gold focus:ring-2 focus:ring-ww-gold focus:outline-none transition ${corVolume(n, max)}`}
                          title={`${x} + ${y}: ${formatNumber(n)} casais — clique pra ver`}>
                          {formatNumber(n)}
                        </button>
                      ) : (
                        <div className="px-2 py-2 text-center text-slate-300 bg-slate-50 rounded">—</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 pt-2">
        Cada célula = casais com aquela combinação · cor mais forte = mais casais · números no topo/lado = totais. Clique numa célula pra ver os casais.
      </p>
    </div>
  )
}
