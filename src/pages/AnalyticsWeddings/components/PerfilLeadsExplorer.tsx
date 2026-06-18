import { useState } from 'react'
import { useWwFunilRanking, type WwFunilRankingRow, type DrillMarco } from '@/hooks/analyticsWeddings/useWw2'
import type { AppliedFilters } from './FilterBar'
import type { DrillContext } from './DrillDrawer'
import { SectionCard, EmptyState, LoadingSkeleton } from './ui'
import { formatNumber } from '../lib/format'

// "Perfil dos leads" — QUEM são os leads (o que o casal preencheu no formulário:
// cidade/destino, investimento, convidados) e como esse perfil se distribui numa
// ETAPA escolhida do funil (entraram, fizeram reunião, fecharam…). Cruzamento de
// duas dimensões opcional (ex: cidade × investimento). Respeita os filtros do topo
// — então dá pra olhar o perfil por origem (marketing) ou por consultor (vendas).
// Fonte: ww_funil_ranking_combo (mesma base do funil por perfil), recortada pela barra.

type PerfilDim = 'destino' | 'faixa' | 'convidados'
const DIM_OPTS: { id: PerfilDim; label: string }[] = [
  { id: 'destino', label: 'Cidade / destino' },
  { id: 'faixa', label: 'Investimento' },
  { id: 'convidados', label: 'Convidados' },
]
const DIM_LABEL: Record<PerfilDim, string> = { destino: 'Cidade / destino', faixa: 'Investimento', convidados: 'Convidados' }

// Ordem canônica: faixa/convidados são ordinais; destino é categórico (ordena por volume).
const ORDER: Partial<Record<PerfilDim, string[]>> = {
  faixa: ['Até R$50 mil', 'R$50-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil'],
  convidados: ['Apenas o casal', 'Até 20', '20-50', '50-100', '50-80', '80-100', '+100'],
}
const isNI = (b: string) => /n[ãa]o\s*informad/i.test(b)

// Lente de etapa — qual população do funil olhar. drillMarco liga ao drill (ww_drill_casais).
type StageKey = 'entrou' | 'fez_sdr' | 'marcou_closer' | 'fez_closer' | 'ganho'
const STAGE_OPTS: { id: StageKey; label: string; marco: DrillMarco }[] = [
  { id: 'entrou', label: 'Entraram', marco: 'entrou' },
  { id: 'fez_sdr', label: 'Fizeram 1ª reunião', marco: 'fez_sdr' },
  { id: 'marcou_closer', label: 'Marcaram closer', marco: 'marcou_closer' },
  { id: 'fez_closer', label: 'Fizeram closer', marco: 'fez_closer' },
  { id: 'ganho', label: 'Fecharam', marco: 'ganho' },
]

const bucketOf = (r: WwFunilRankingRow, d: PerfilDim): string =>
  (d === 'destino' ? r.destino : d === 'faixa' ? r.faixa : r.convidados) ?? r.label ?? 'Não informado'
const countAt = (r: WwFunilRankingRow, s: StageKey): number =>
  s === 'entrou' ? r.entrou : s === 'fez_sdr' ? r.fez_sdr : s === 'marcou_closer' ? r.marcou_closer : s === 'fez_closer' ? r.fez_closer : r.ganho

// ordena buckets de uma dimensão: ordem canônica quando existe, senão por volume; "Não informado" por último
function ordenarBuckets(dim: PerfilDim, buckets: string[], peso: (b: string) => number): string[] {
  const order = ORDER[dim]
  const arr = [...buckets]
  if (order) arr.sort((a, b) => ((order.indexOf(a) + 1) || 999) - ((order.indexOf(b) + 1) || 999))
  else arr.sort((a, b) => peso(b) - peso(a))
  arr.sort((a, b) => Number(isNI(a)) - Number(isNI(b)))
  return arr
}

type Props = {
  filters: AppliedFilters
  // recorte base do drill (mesmos chips da aba) — composto com marco + bucket no clique
  baseCtx: Partial<DrillContext>
  onDrill: (ctx: DrillContext) => void
}

export function PerfilLeadsExplorer({ filters, baseCtx, onDrill }: Props) {
  const [dimX, setDimX] = useState<PerfilDim>('destino')
  const [dimY, setDimY] = useState<PerfilDim | 'none'>('none')
  const [stage, setStage] = useState<StageKey>('entrou')

  // 2ª dimensão não pode ser igual à 1ª; se colidir, cai pra "Nenhuma"
  const cruz = dimY !== 'none' && dimY !== dimX ? dimY : null
  const dims: PerfilDim[] = cruz ? [dimX, cruz] : [dimX]

  const { data, isLoading } = useWwFunilRanking({
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    dateMode: filters.dateMode,
    dimensoes: dims,
    origins: filters.origins,
    tipos: filters.tipos,
    consultorIds: filters.consultorIds,
    canalSdr: filters.canalSdr,
    canalCloser: filters.canalCloser,
    faixas: filters.faixas,
    convidados: filters.convidados,
    destinos: filters.destinos,
    statusLead: filters.statusLead,
  })

  const stageLabel = STAGE_OPTS.find(s => s.id === stage)!.label
  const marco = STAGE_OPTS.find(s => s.id === stage)!.marco
  const rows = data?.rows ?? []
  const totalStage = rows.reduce((s, r) => s + countAt(r, stage), 0)

  const drillBucket = (dim: PerfilDim, bucket: string): Partial<DrillContext> => {
    const niSel = isNI(bucket) ? 'Não informado' : bucket
    if (dim === 'destino') return { destino: niSel }
    if (dim === 'faixa') return { faixa: niSel }
    return { convidados: niSel }
  }

  return (
    <SectionCard
      title="Perfil dos leads: quem são"
      subtitle="O que o casal preencheu no formulário — cidade, investimento e convidados — para a etapa do funil que você escolher. Cruze duas dimensões e use os filtros do topo (origem, consultor, período) pra olhar de ângulos diferentes. Clique pra ver os casais."
    >
      {/* Controles */}
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap mb-4">
        <div className="inline-flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-400">Ver por</span>
          <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {DIM_OPTS.map(d => (
              <button
                key={d.id}
                onClick={() => { setDimX(d.id); if (dimY === d.id) setDimY('none') }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${dimX === d.id ? 'bg-white text-ww-gold-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-400">Cruzar com</span>
          <select
            value={dimY}
            onChange={e => setDimY(e.target.value as PerfilDim | 'none')}
            className="px-2.5 py-1.5 text-xs font-medium bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors"
          >
            <option value="none">Nenhuma</option>
            {DIM_OPTS.filter(d => d.id !== dimX).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-400">Etapa</span>
          <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 flex-wrap">
            {STAGE_OPTS.map(s => (
              <button
                key={s.id}
                onClick={() => setStage(s.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${stage === s.id ? 'bg-white text-ww-gold-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <span className="ml-auto text-xs text-slate-500">
          <strong className="text-slate-700 tabular-nums">{formatNumber(totalStage)}</strong> {stageLabel.toLowerCase()}
        </span>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : totalStage === 0 ? (
        <EmptyState message="Sem leads nessa etapa pra esse recorte. Amplie o período ou tire filtros." />
      ) : cruz ? (
        <CruzMatriz
          rows={rows} dimX={dimX} dimY={cruz} stage={stage}
          onCellClick={(bx, by) => onDrill({ ...baseCtx, marco, ...drillBucket(dimX, bx), ...drillBucket(cruz, by), title: `${stageLabel} — ${bx} + ${by}` } as DrillContext)}
        />
      ) : (
        <Distribuicao
          rows={rows} dim={dimX} stage={stage} total={totalStage}
          onBucketClick={(b) => onDrill({ ...baseCtx, marco, ...drillBucket(dimX, b), title: `${stageLabel} — ${DIM_LABEL[dimX]}: ${b}` } as DrillContext)}
        />
      )}
    </SectionCard>
  )
}

// Distribuição de UMA dimensão — barra por bucket (% da etapa), ordenada e clicável.
function Distribuicao({ rows, dim, stage, total, onBucketClick }: {
  rows: WwFunilRankingRow[]
  dim: PerfilDim
  stage: StageKey
  total: number
  onBucketClick: (bucket: string) => void
}) {
  // soma por bucket (single dim já vem único, mas somamos por segurança)
  const porBucket = new Map<string, number>()
  for (const r of rows) {
    const b = bucketOf(r, dim)
    porBucket.set(b, (porBucket.get(b) ?? 0) + countAt(r, stage))
  }
  const buckets = ordenarBuckets(dim, [...porBucket.keys()].filter(b => (porBucket.get(b) ?? 0) > 0), b => porBucket.get(b) ?? 0)
  const max = Math.max(1, ...buckets.map(b => porBucket.get(b) ?? 0))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 pb-1 text-[10px] uppercase tracking-wide text-slate-400">
        <span className="flex-1">{DIM_LABEL[dim]}</span>
        <span className="w-12 text-right">casais</span>
        <span className="w-12 text-right">% do total</span>
      </div>
      {buckets.map(b => {
        const n = porBucket.get(b) ?? 0
        const pct = total > 0 ? Math.round((n / total) * 100) : 0
        return (
          <button
            key={b}
            onClick={() => onBucketClick(b)}
            className="w-full flex items-center gap-3 py-1 text-left rounded group hover:bg-ww-cream/40 transition-colors"
            title={`Ver casais — ${b}`}
          >
            <span className={`w-40 shrink-0 text-sm truncate transition-colors ${isNI(b) ? 'text-slate-400 italic' : 'text-slate-700 group-hover:text-ww-gold-ink'}`} title={b}>{b}</span>
            <div className="flex-1 h-5 bg-ww-cream/70 rounded overflow-hidden">
              <div className="h-full bg-ww-gold/80 rounded group-hover:bg-ww-gold-ink transition-colors" style={{ width: `${Math.max(2, (n / max) * 100)}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right text-sm font-semibold text-slate-900 tabular-nums">{formatNumber(n)}</span>
            <span className="w-12 shrink-0 text-right text-xs text-slate-500 tabular-nums">{pct}%</span>
          </button>
        )
      })}
      <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
        Barra = quantos casais daquela {DIM_LABEL[dim].toLowerCase()} · % = fatia do total da etapa. Clique numa linha pra ver os casais e abrir no Active.
      </p>
    </div>
  )
}

// cor por VOLUME (composição) — onde os leads se concentram. Tokens do tema WW.
function corVolume(n: number, max: number): string {
  if (n === 0) return 'bg-slate-50 text-slate-300'
  const r = max > 0 ? n / max : 0
  if (r >= 0.66) return 'bg-ww-gold text-white'
  if (r >= 0.33) return 'bg-ww-gold-soft text-ww-gold-ink'
  return 'bg-ww-cream text-ww-n700'
}

// Cruzamento de DUAS dimensões — heatmap de volume (cidade × investimento etc.).
function CruzMatriz({ rows, dimX, dimY, stage, onCellClick }: {
  rows: WwFunilRankingRow[]
  dimX: PerfilDim
  dimY: PerfilDim
  stage: StageKey
  onCellClick: (bx: string, by: string) => void
}) {
  const cell = new Map<string, number>()
  const somaX = new Map<string, number>()
  const somaY = new Map<string, number>()
  for (const r of rows) {
    const bx = bucketOf(r, dimX), by = bucketOf(r, dimY), n = countAt(r, stage)
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
    <div className="space-y-2">
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
                        <button
                          onClick={() => onCellClick(x, y)}
                          className={`w-full h-full px-2 py-2 text-center rounded tabular-nums font-semibold cursor-pointer hover:ring-2 hover:ring-ww-gold focus:ring-2 focus:ring-ww-gold focus:outline-none transition ${corVolume(n, max)}`}
                          title={`${x} + ${y}: ${formatNumber(n)} casais — clique pra ver`}
                        >
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
      <p className="text-[11px] text-slate-400">
        Cada célula = quantos casais têm aquela combinação · cor mais forte = mais casais. Os números no topo/lado são os totais de cada cidade/faixa. Clique numa célula pra ver os casais.
      </p>
    </div>
  )
}
