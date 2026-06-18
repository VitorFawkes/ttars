import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import {
  useWwPerfilTemporal, useWwFunilRanking,
  type WwPerfilDim, type WwPerfilMarco, type WwPerfilCategoria,
  type WwFunilRankingRow,
} from '@/hooks/analyticsWeddings/useWw2'
import type { AppliedFilters } from './FilterBar'
import type { DrillContext } from './DrillDrawer'
import { SectionCard, EmptyState, LoadingSkeleton } from './ui'
import { formatNumber } from '../lib/format'

// "Perfil dos leads" — QUEM são os leads (o que o casal preencheu no formulário:
// cidade/destino, investimento, convidados; + origem de marketing e tipo) e como esse
// perfil se comporta: AO LONGO DO TEMPO (mês/semana), num funil POR CATEGORIA, e em
// CRUZAMENTO de duas dimensões. Recortável por etapa do funil e por todos os filtros do
// topo — então dá pra olhar por origem (marketing) ou por consultor (vendas), no recorte
// recente ou num histórico grande. Fontes: ww_perfil_temporal + ww_funil_ranking_combo.

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
}
const isNI = (b: string) => /n[ãa]o\s*informad/i.test(b) || b === 'Desconhecida'

// Paleta com o tom Weddings (dourado/rosewood) + complementares suaves; "Outros" em cinza.
const PALETA = ['#BD965C', '#874B52', '#A8B5A2', '#C9A66B', '#6E7F80', '#B07C9E', '#7C9885', '#9B8281', '#CBB994']
const COR_OUTROS = '#cbd5e1'
const corBucket = (bucket: string, i: number) => (bucket === 'Outros' ? COR_OUTROS : PALETA[i % PALETA.length])

function ordenarBuckets(dim: Dim, buckets: string[], peso: (b: string) => number): string[] {
  const order = ORDER[dim]
  const arr = [...buckets]
  if (order) arr.sort((a, b) => ((order.indexOf(a) + 1) || 999) - ((order.indexOf(b) + 1) || 999))
  else arr.sort((a, b) => peso(b) - peso(a))
  arr.sort((a, b) => Number(isNI(a)) - Number(isNI(b)))
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
  const [gran, setGran] = useState<'month' | 'week'>('month')
  const [cruzY, setCruzY] = useState<Dim>('faixa')

  const stageLabel = STAGE_LABEL(marco)
  const isForm = FORM_DIMS.includes(dim)

  const temporal = useWwPerfilTemporal({
    dateStart: filters.dateStart, dateEnd: filters.dateEnd, dateMode: filters.dateMode,
    dim, marco, granularidade: gran,
    origins: filters.origins, tipos: filters.tipos, consultorIds: filters.consultorIds,
    faixas: filters.faixas, convidados: filters.convidados, destinos: filters.destinos,
    canalSdr: filters.canalSdr, canalCloser: filters.canalCloser, statusLead: filters.statusLead,
  })

  // Cruzamento só faz sentido entre os campos do formulário (cidade/faixa/convidados).
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

  return (
    <SectionCard
      title="Perfil dos leads: quem são"
      subtitle="O que o casal declara no formulário (cidade, investimento, convidados) + origem de marketing e tipo. Veja a composição ao longo do tempo, o funil por categoria e o cruzamento de duas dimensões — na etapa que quiser. Use os filtros do topo (origem, consultor, período) pra olhar de ângulos diferentes. Clique pra ver os casais."
    >
      {/* Controles compartilhados */}
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap mb-3">
        <div className="inline-flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-400">Ver por</span>
          <select
            value={dim}
            onChange={e => setDim(e.target.value as Dim)}
            className="px-2.5 py-1.5 text-sm font-medium bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors"
          >
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
              <button key={v.id} disabled={disabled}
                onClick={() => setView(v.id)}
                title={disabled ? 'Cruzamento vale para cidade, investimento e convidados' : undefined}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${view === v.id ? 'bg-white text-ww-gold-ink shadow-sm' : disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-700'}`}>
                {v.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sub-controle por visão */}
      {view === 'tempo' && (
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <span className="text-xs text-slate-500">
            <strong className="text-slate-700 tabular-nums">{formatNumber(totalMarco)}</strong> {stageLabel.toLowerCase()} no período
            {filters.dateMode === 'cohort' ? ' · pela data de entrada' : ' · pela data do evento'}
          </span>
          <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {(['month', 'week'] as const).map(g => (
              <button key={g} onClick={() => setGran(g)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${gran === g ? 'bg-white text-ww-gold-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {g === 'month' ? 'Por mês' : 'Por semana'}
              </button>
            ))}
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
          : <TempoChart temporal={temporal.data!} dim={dim} />
      )}
      {view === 'tabela' && (
        temporal.isLoading ? <LoadingSkeleton rows={6} />
          : (temporal.data?.por_categoria.length ?? 0) === 0 ? <EmptyState message="Sem leads no período pra esse recorte." />
          : <CategoriaTabela
              cats={temporal.data!.por_categoria} dim={dim} marco={marco}
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

// ── Visão 1: composição AO LONGO DO TEMPO (barras empilhadas) ──────────────────
function TempoChart({ temporal, dim }: { temporal: NonNullable<ReturnType<typeof useWwPerfilTemporal>['data']>; dim: Dim }) {
  const hasOutros = temporal.series.some(s => s.bucket === 'Outros')
  const stackKeys = [...temporal.buckets_top, ...(hasOutros ? ['Outros'] : [])]

  // pivot: período (ordenado por data, como vem do SQL) × bucket
  const ordem: { periodo: string; label: string }[] = []
  const vistos = new Set<string>()
  for (const s of temporal.series) if (!vistos.has(s.periodo)) { vistos.add(s.periodo); ordem.push({ periodo: s.periodo, label: s.label }) }
  const rowMap = new Map<string, Record<string, number | string>>()
  for (const p of ordem) {
    const row: Record<string, number | string> = { label: p.label }
    for (const k of stackKeys) row[k] = 0
    rowMap.set(p.periodo, row)
  }
  for (const s of temporal.series) {
    const r = rowMap.get(s.periodo)
    if (r) r[s.bucket] = s.n
  }
  const data = ordem.map(p => rowMap.get(p.periodo)!)

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} interval="preserveStartEnd" />
          <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {stackKeys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="a" fill={corBucket(k, i)} maxBarSize={44}
              radius={i === stackKeys.length - 1 ? [3, 3, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 mt-1">
        Cada barra = um período; as cores são as {DIM_LABEL[dim].toLowerCase()}s mais comuns (as demais somam em "Outros"). Troque a etapa lá em cima pra ver entradas, reuniões ou fechamentos ao longo do tempo.
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
function CategoriaTabela({ cats, dim, marco, onRowClick }: {
  cats: WwPerfilCategoria[]
  dim: Dim
  marco: WwPerfilMarco
  onRowClick: (bucket: string) => void
}) {
  const ordenadas = ordenarBuckets(dim, cats.map(c => c.bucket), b => cats.find(c => c.bucket === b)?.entrou ?? 0)
    .map(b => cats.find(c => c.bucket === b)!).filter(Boolean)
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
