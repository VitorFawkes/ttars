import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { WwFunilRanking, WwFunilRankingDim, WwFunilRankingRow } from '@/hooks/analyticsWeddings/useWw2'
import { MARCO_KEYS, MARCO_LABELS, fmtPct, fmtDeltaPp, stepPct, cumPct } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { EmptyState, LoadingSkeleton } from './ui'

// MATRIZ "Funil por perfil" — todos os tipos de lead e o funil de cada um de
// uma vez. Linha = um tipo de lead; coluna = etapa do funil. A leitura é a
// PASSAGEM (de quem chegou na etapa anterior, quantos % avançaram) — é onde dá
// pra ver onde cada perfil trava. A cor é semântica ABSOLUTA (verde = passa
// bem, vermelho = trava de verdade), então um gargalo sistêmico (ex: a reunião
// com o closer) salta aos olhos em vez de ficar tudo verde.
// 3 layouts comutáveis ("Ver como"): Tabela · Lado a lado · Mini-funis.
// Clicar numa linha preenche o filtro e abre o funil completo (A|B) abaixo.

const DIM_LABEL: Record<WwFunilRankingDim, string> = { faixa: 'Investimento', convidados: 'Convidados', destino: 'Destino' }
type Vista = 'tabela' | 'lado' | 'funis'
const VISTA_LABEL: Record<Vista, string> = { tabela: 'Tabela', lado: 'Lado a lado', funis: 'Mini-funis' }
type Metrica = 'passagem' | 'mudanca'
type SortKey = 'fechamento' | 'queda' | 'volume'
const SORT_LABEL: Record<SortKey, string> = { fechamento: 'Melhor fechamento', queda: 'Maior queda', volume: 'Mais leads' }
const AMOSTRA_MIN = 5

// Rótulos curtos das colunas. "Marcou" = agendou a reunião; "Fez" = aconteceu.
const COL_LABEL: Record<string, string> = {
  entrou: 'Entrou',
  marcou_sdr: 'Marcou SDR',
  fez_sdr: 'Fez SDR',
  marcou_closer: 'Marcou closer',
  fez_closer: 'Fez closer',
  ganho: 'Ganho',
}

type Linha = {
  bucket: string
  entrouA: number
  entrouB: number
  countsA: number[] // índice = MARCO_KEYS
  countsB: number[]
  taxaA: number | null // taxa de fechamento (ganho / entrou)
  taxaB: number | null
  queda: number | null // taxaB - taxaA
}

function getBucket(row: WwFunilRankingRow, dim: WwFunilRankingDim): string {
  return (dim === 'faixa' ? row.faixa : dim === 'convidados' ? row.convidados : row.destino) ?? row.label
}
function counts(row: WwFunilRankingRow | undefined): number[] {
  if (!row) return [0, 0, 0, 0, 0, 0]
  return [row.entrou, row.marcou_sdr, row.fez_sdr, row.marcou_closer, row.fez_closer, row.ganho]
}
const passagem = (c: number[], i: number): number | null => (i === 0 ? null : stepPct(c[i], c[i - 1]))

// Soma de todos os perfis mostrados — base das linhas/cards de "Total".
function somaTotal(linhas: Linha[]) {
  const cA = [0, 0, 0, 0, 0, 0]
  const cB = [0, 0, 0, 0, 0, 0]
  let eA = 0
  let eB = 0
  for (const l of linhas) {
    eA += l.entrouA; eB += l.entrouB
    for (let i = 0; i < 6; i++) { cA[i] += l.countsA[i]; cB[i] += l.countsB[i] }
  }
  return { entrouA: eA, entrouB: eB, countsA: cA, countsB: cB }
}

// Cor SEMÂNTICA ABSOLUTA da passagem: bom/ruim de verdade (não relativo à coluna).
function corPassagem(p: number | null, small: boolean): string {
  if (small) return 'bg-slate-50 text-slate-400'
  if (p == null) return 'bg-slate-50 text-slate-300'
  if (p >= 60) return 'bg-emerald-200 text-emerald-900'
  if (p >= 45) return 'bg-emerald-100 text-emerald-900'
  if (p >= 25) return 'bg-amber-100 text-amber-900'
  return 'bg-rose-100 text-rose-900'
}
// Cor da MUDANÇA (Δpp B vs A): subiu = verde, caiu = vermelho.
function corMudanca(d: number | null, small: boolean): string {
  if (small) return 'bg-slate-50 text-slate-400'
  if (d == null) return 'bg-slate-50 text-slate-300'
  const a = Math.abs(d)
  if (d > 0) return a >= 10 ? 'bg-emerald-200 text-emerald-900' : 'bg-emerald-100 text-emerald-900'
  if (d < 0) return a >= 10 ? 'bg-rose-200 text-rose-900' : 'bg-rose-100 text-rose-900'
  return 'bg-slate-50 text-slate-500'
}
const ENTROU_BG = 'bg-slate-100 text-slate-700'
// Cor sólida da barra (mini-funis) — classes literais (Tailwind JIT exige strings estáticas).
function corBarra(p: number | null, small: boolean): string {
  if (small) return 'bg-slate-200'
  if (p == null) return 'bg-slate-300'
  if (p >= 60) return 'bg-emerald-400'
  if (p >= 45) return 'bg-emerald-300'
  if (p >= 25) return 'bg-amber-300'
  return 'bg-rose-300'
}

type Props = {
  dim: WwFunilRankingDim
  onDim: (d: WwFunilRankingDim) => void
  rankingA: WwFunilRanking | undefined
  rankingB: WwFunilRanking | undefined
  labelA: string
  labelB: string
  isLoading: boolean
  selecionado: string | null
  onPick: (dim: WwFunilRankingDim, bucket: string) => void
  bRecente: boolean
  /** Ganhos DW no período B (do funil) — para reconciliar com o total de casamentos. */
  ganhoDW?: number
  /** Ganhos Elopement no período B (pipeline próprio, fora do funil DW). */
  elopementGanho?: number
}

export function FunilMatriz({ dim, onDim, rankingA, rankingB, labelA, labelB, isLoading, selecionado, onPick, bRecente, ganhoDW, elopementGanho }: Props) {
  const [vista, setVista] = useState<Vista>('tabela')
  const [metrica, setMetrica] = useState<Metrica>('passagem')
  const [sortKey, setSortKey] = useState<SortKey>('fechamento')
  const [soComAmostra, setSoComAmostra] = useState(false)

  const todas = useMemo<Linha[]>(() => {
    const rowsA = rankingA?.rows ?? []
    const rowsB = rankingB?.rows ?? []
    const mapA = new Map(rowsA.map((r) => [getBucket(r, dim), r]))
    const mapB = new Map(rowsB.map((r) => [getBucket(r, dim), r]))
    const buckets = Array.from(new Set([...mapA.keys(), ...mapB.keys()]))
    return buckets.map((bucket) => {
      const a = mapA.get(bucket)
      const b = mapB.get(bucket)
      const taxaA = a?.taxa_pct ?? null
      const taxaB = b?.taxa_pct ?? null
      return {
        bucket,
        entrouA: a?.entrou ?? 0,
        entrouB: b?.entrou ?? 0,
        countsA: counts(a),
        countsB: counts(b),
        taxaA,
        taxaB,
        queda: taxaA != null && taxaB != null ? taxaB - taxaA : null,
      }
    })
  }, [rankingA, rankingB, dim])

  const pequena = (l: Linha) => l.entrouB < AMOSTRA_MIN && l.entrouA < AMOSTRA_MIN
  const visiveis = soComAmostra ? todas.filter((l) => !pequena(l)) : todas
  const escondidas = todas.length - visiveis.length

  const ordenadas = useMemo(() => {
    const arr = [...visiveis]
    const nl = (v: number | null) => (v == null ? -Infinity : v)
    if (sortKey === 'fechamento') arr.sort((x, y) => nl(y.taxaB) - nl(x.taxaB))
    else if (sortKey === 'volume') arr.sort((x, y) => y.entrouB - x.entrouB)
    else arr.sort((x, y) => (x.queda == null ? Infinity : x.queda) - (y.queda == null ? Infinity : y.queda))
    return arr
  }, [visiveis, sortKey])

  // Manchete: quem mais fecha + a etapa que mais trava no geral (passagem agregada).
  const insight = useMemo(() => {
    const base = ordenadas.filter((l) => !pequena(l))
    if (!base.length) return null
    const leader = base.reduce((best, l) => ((l.taxaB ?? -1) > (best.taxaB ?? -1) ? l : best))
    let worst: { label: string; p: number } | null = null
    for (let i = 1; i < MARCO_KEYS.length; i++) {
      const prev = base.reduce((s, l) => s + l.countsB[i - 1], 0)
      const cur = base.reduce((s, l) => s + l.countsB[i], 0)
      if (prev > 0) {
        const p = (cur / prev) * 100
        if (!worst || p < worst.p) worst = { label: MARCO_LABELS[MARCO_KEYS[i]], p }
      }
    }
    return { leader, gargalo: worst }
  }, [ordenadas])

  const podeMudanca = (rankingA?.rows?.length ?? 0) > 0

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 hover:shadow-md transition-shadow">
      {/* Cabeçalho + segmentação */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">Funil por perfil</h3>
          <p className="text-sm text-slate-500">Cada linha é um tipo de lead; cada coluna, uma etapa. A cor mostra onde cada um avança bem (verde) ou trava (vermelho). Clique numa linha pra ver os casais daquele perfil e abrir no Active.</p>
        </div>
        <div className="shrink-0">
          <div className="text-xs font-medium text-slate-400 mb-1 text-right">Ver por</div>
          <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {(['faixa', 'convidados', 'destino'] as WwFunilRankingDim[]).map((d) => (
              <button key={d} onClick={() => onDim(d)} className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${dim === d ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{DIM_LABEL[d]}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Manchete diagnóstica */}
      {insight && (
        <div className="mt-3 mb-1 rounded-lg bg-indigo-50 border border-indigo-100 px-3.5 py-2.5">
          <p className="text-sm text-slate-800">
            <strong className="text-indigo-800">{insight.leader.bucket}</strong> é quem mais fecha (<strong>{fmtPct(insight.leader.taxaB)}</strong>).
            {insight.gargalo && <> A etapa que mais trava no geral é <strong className="text-rose-700">{insight.gargalo.label}</strong> — só <strong>{fmtPct(insight.gargalo.p)}</strong> avançam.</>}
          </p>
        </div>
      )}

      {/* Controles */}
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap mt-3 mb-3">
        <div className="inline-flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-400">Ver como</span>
          <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {(['tabela', 'lado', 'funis'] as Vista[]).map((v) => (
              <button key={v} onClick={() => setVista(v)} className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${vista === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{VISTA_LABEL[v]}</button>
            ))}
          </div>
        </div>
        {vista === 'tabela' && podeMudanca && (
          <div className="inline-flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-400">Mostrar</span>
            <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setMetrica('passagem')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${metrica === 'passagem' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>passagem</button>
              <button onClick={() => setMetrica('mudanca')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${metrica === 'mudanca' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>mudança vs {labelA}</button>
            </div>
          </div>
        )}
        <div className="inline-flex items-center gap-1">
          <span className="text-xs font-medium text-slate-400 mr-0.5">Ordenar</span>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <button key={k} onClick={() => setSortKey(k)} className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition ${sortKey === k ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>{SORT_LABEL[k]}</button>
          ))}
        </div>
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={soComAmostra} onChange={(e) => setSoComAmostra(e.target.checked)} className="rounded border-slate-300" />
          Esconder perfis com menos de {AMOSTRA_MIN} leads
        </label>
      </div>

      {/* Período em foco */}
      <p className="text-xs text-slate-500 mb-3">
        Período: <strong className="text-slate-700">{labelB}</strong>
        {metrica === 'mudanca' && vista === 'tabela' ? <> · comparando com <strong className="text-slate-700">{labelA}</strong></> : vista === 'lado' ? <> · ao lado de <strong className="text-slate-700">{labelA}</strong></> : null}
      </p>

      {bRecente && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          O período mais recente ainda está amadurecendo — as etapas finais (Fez closer, Ganho) tendem a subir conforme os casamentos fecham. Compare com cautela.
        </p>
      )}

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : ordenadas.length === 0 ? (
        <EmptyState message="Sem perfis com dados nesses períodos. Amplie a janela ou tire filtros." />
      ) : (
        <>
          {vista === 'tabela' && <TabelaView linhas={ordenadas} dim={dim} metrica={metrica} selecionado={selecionado} onPick={onPick} pequena={pequena} />}
          {vista === 'lado' && <LadoView linhas={ordenadas} dim={dim} labelA={labelA} labelB={labelB} selecionado={selecionado} onPick={onPick} pequena={pequena} />}
          {vista === 'funis' && <FunisView linhas={ordenadas} dim={dim} selecionado={selecionado} onPick={onPick} pequena={pequena} />}

          {/* Reconciliação: este funil é DW; Elopement (pipeline próprio) conta à parte */}
          {elopementGanho != null && elopementGanho > 0 && ganhoDW != null && (
            <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-600">
              Este funil é de <strong className="text-slate-800">Destination Wedding</strong>. <strong className="text-slate-800">Elopements</strong> têm pipeline próprio (etapas diferentes) e não entram aqui — foram <strong className="text-slate-800 tabular-nums">{formatNumber(elopementGanho)}</strong> em {labelB}. Total de casamentos: <strong className="text-slate-800 tabular-nums">{formatNumber(ganhoDW)}</strong> DW + <strong className="text-slate-800 tabular-nums">{formatNumber(elopementGanho)}</strong> Elopement = <strong className="text-emerald-700 tabular-nums">{formatNumber(ganhoDW + elopementGanho)}</strong>.
            </div>
          )}

          {/* Rodapé: contador + legenda */}
          <div className="flex items-start justify-between gap-3 flex-wrap pt-3">
            <p className="text-xs text-slate-400">
              Mostrando {ordenadas.length} de {todas.length} perfis{escondidas > 0 && <> · {escondidas} com menos de {AMOSTRA_MIN} leads {soComAmostra ? <button onClick={() => setSoComAmostra(false)} className="text-indigo-600 hover:underline">mostrar</button> : 'marcados como "poucos"'}</>}.
            </p>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-100 pt-2 mt-1">
            <strong className="text-slate-500">Marcou</strong> = agendou a reunião · <strong className="text-slate-500">Fez</strong> = a reunião aconteceu (no SDR, também qualificou). {vista === 'lado'
              ? <>Cada etapa mostra a passagem em {labelA} → {labelB}. A cor indica se melhorou (verde) ou piorou (vermelho). O <strong className="text-slate-500">número miúdo</strong> embaixo é o nº de leads que chegaram naquela etapa.</>
              : vista === 'funis'
              ? <>Cada barra = quanto do total que entrou chega àquela etapa (formato de funil). A cor da barra mostra se a passagem daquela etapa é boa (verde) ou trava (vermelho).</>
              : metrica === 'mudanca'
              ? <>Cada célula = a <strong className="text-slate-500">mudança</strong> da passagem entre {labelA} e {labelB}, em pontos percentuais; o <strong className="text-slate-500">número miúdo</strong> embaixo é a quantidade de pessoas. A última linha (<strong className="text-slate-600">Total</strong>) soma todos os perfis.</>
              : <>Cada % = de quem chegou na etapa anterior, quantos <strong className="text-slate-500">avançaram</strong>; o <strong className="text-slate-500">número miúdo</strong> embaixo é a quantidade de pessoas. <span className="text-emerald-700">Verde</span> = passa bem, <span className="text-rose-700">vermelho</span> = trava. A coluna <strong className="text-slate-500">Entrou</strong> é o nº de leads, e a última linha (<strong className="text-slate-600">Total</strong>) soma todos os perfis.</>}
          </p>
        </>
      )}
    </div>
  )
}

// ───────────────────────── Tabela (heatmap) ─────────────────────────
type ViewProps = {
  linhas: Linha[]
  dim: WwFunilRankingDim
  selecionado: string | null
  onPick: (dim: WwFunilRankingDim, bucket: string) => void
  pequena: (l: Linha) => boolean
}

function TabelaView({ linhas, dim, metrica, selecionado, onPick, pequena }: ViewProps & { metrica: Metrica }) {
  const tot = somaTotal(linhas)
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-2 py-1.5 align-bottom">{DIM_LABEL[dim]}</th>
            {MARCO_KEYS.map((k) => (
              <th key={k} className="px-1.5 py-1.5 align-bottom min-w-[84px]">
                <div className="text-xs font-medium text-slate-600 text-center leading-tight">{COL_LABEL[k]}</div>
                <div className="text-xs text-slate-400 text-center">{k === 'entrou' ? 'nº' : metrica === 'mudanca' ? 'Δ · nº' : '% · nº'}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const isSel = selecionado === l.bucket
            const small = pequena(l)
            return (
              <tr key={l.bucket} onClick={() => onPick(dim, l.bucket)} className="cursor-pointer group">
                <td className={`sticky left-0 z-10 px-2 py-1.5 rounded-l-lg text-left align-middle transition ${isSel ? 'bg-indigo-50' : 'bg-white group-hover:bg-indigo-50/40'}`}>
                  <div className="flex items-center gap-1">
                    <span className={`text-sm font-medium whitespace-nowrap ${isSel ? 'text-indigo-800' : 'text-slate-800'}`}>{l.bucket}</span>
                    {small && <span className="px-1 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">poucos</span>}
                    <ChevronRight className={`w-3.5 h-3.5 ml-auto shrink-0 transition ${isSel ? 'text-indigo-500' : 'text-slate-300 group-hover:text-indigo-400'}`} />
                  </div>
                </td>
                {MARCO_KEYS.map((k, i) => {
                  const pB = passagem(l.countsB, i)
                  const pA = passagem(l.countsA, i)
                  let bg: string
                  let txt: string
                  let count: string | null = null
                  let title: string
                  if (i === 0) {
                    if (metrica === 'mudanca') {
                      const dv = l.entrouB - l.entrouA
                      bg = small ? 'bg-slate-50 text-slate-400' : ENTROU_BG
                      txt = dv === 0 ? formatNumber(l.entrouB) : `${dv > 0 ? '+' : '−'}${formatNumber(Math.abs(dv))}`
                      title = `${formatNumber(l.entrouA)} → ${formatNumber(l.entrouB)} leads`
                    } else {
                      bg = small ? 'bg-slate-50 text-slate-400' : ENTROU_BG
                      txt = formatNumber(l.entrouB)
                      title = `${formatNumber(l.entrouB)} leads entraram`
                    }
                  } else if (metrica === 'mudanca') {
                    const d = pA != null && pB != null ? pB - pA : null
                    bg = corMudanca(d, small)
                    txt = fmtDeltaPp(d)
                    count = formatNumber(l.countsB[i])
                    title = `passagem: ${fmtPct(pA)} → ${fmtPct(pB)} · ${formatNumber(l.countsB[i])} pessoas`
                  } else {
                    bg = corPassagem(pB, small)
                    txt = fmtPct(pB)
                    count = formatNumber(l.countsB[i])
                    title = `${formatNumber(l.countsB[i])} de ${formatNumber(l.countsB[i - 1])} avançaram (${fmtPct(pB)})`
                  }
                  return (
                    <td key={k} title={title} className={`px-1.5 py-1.5 text-center tabular-nums align-middle rounded transition ${bg} ${isSel ? 'ring-1 ring-indigo-300' : ''}`}>
                      <div className="text-sm font-semibold leading-none">{txt}</div>
                      {count != null && <div className="text-[10px] font-normal leading-none mt-1 opacity-60">{count}</div>}
                    </td>
                  )
                })}
              </tr>
            )
          })}

          {/* Linha de TOTAL — soma de todos os perfis mostrados */}
          {linhas.length > 1 && (
            <tr>
              <td className="sticky left-0 z-10 px-2 py-1.5 rounded-l-lg text-left align-middle bg-slate-800">
                <span className="text-sm font-bold text-white whitespace-nowrap">Total</span>
              </td>
              {MARCO_KEYS.map((k, i) => {
                let txt: string
                let count: string | null = null
                if (i === 0) {
                  txt = formatNumber(tot.entrouB)
                } else if (metrica === 'mudanca') {
                  const pA = passagem(tot.countsA, i)
                  const pB = passagem(tot.countsB, i)
                  txt = fmtDeltaPp(pA != null && pB != null ? pB - pA : null)
                  count = formatNumber(tot.countsB[i])
                } else {
                  txt = fmtPct(passagem(tot.countsB, i))
                  count = formatNumber(tot.countsB[i])
                }
                return (
                  <td key={k} className="px-1.5 py-1.5 text-center tabular-nums align-middle rounded bg-slate-800 text-white">
                    <div className="text-sm font-bold leading-none">{txt}</div>
                    {count != null && <div className="text-[10px] font-normal leading-none mt-1 text-slate-300">{count}</div>}
                  </td>
                )
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ───────────────────────── Lado a lado (A → B) ─────────────────────────
function LadoView({ linhas, dim, labelA, labelB, selecionado, onPick, pequena }: ViewProps & { labelA: string; labelB: string }) {
  const tot = somaTotal(linhas)
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-2 py-1.5 align-bottom">{DIM_LABEL[dim]}</th>
            {MARCO_KEYS.map((k) => (
              <th key={k} className="px-1.5 py-1.5 align-bottom min-w-[112px]">
                <div className="text-xs font-medium text-slate-600 text-center leading-tight">{COL_LABEL[k]}</div>
                <div className="text-xs text-slate-400 text-center">{k === 'entrou' ? 'nº de leads' : `${labelA} → ${labelB}`}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const isSel = selecionado === l.bucket
            const small = pequena(l)
            return (
              <tr key={l.bucket} onClick={() => onPick(dim, l.bucket)} className="cursor-pointer group">
                <td className={`sticky left-0 z-10 px-2 py-1.5 rounded-l-lg text-left align-middle transition ${isSel ? 'bg-indigo-50' : 'bg-white group-hover:bg-indigo-50/40'}`}>
                  <div className="flex items-center gap-1">
                    <span className={`text-sm font-medium whitespace-nowrap ${isSel ? 'text-indigo-800' : 'text-slate-800'}`}>{l.bucket}</span>
                    {small && <span className="px-1 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">poucos</span>}
                    <ChevronRight className={`w-3.5 h-3.5 ml-auto shrink-0 transition ${isSel ? 'text-indigo-500' : 'text-slate-300 group-hover:text-indigo-400'}`} />
                  </div>
                </td>
                {MARCO_KEYS.map((k, i) => {
                  if (i === 0) {
                    return (
                      <td key={k} title={`${formatNumber(l.entrouA)} → ${formatNumber(l.entrouB)} leads`} className={`px-1.5 py-2 text-center tabular-nums align-middle rounded ${small ? 'bg-slate-50 text-slate-400' : ENTROU_BG} ${isSel ? 'ring-1 ring-indigo-300' : ''}`}>
                        <span className="text-xs text-slate-400">{formatNumber(l.entrouA)}</span>
                        <span className="text-slate-300 mx-0.5">→</span>
                        <span className="text-sm font-medium">{formatNumber(l.entrouB)}</span>
                      </td>
                    )
                  }
                  const pA = passagem(l.countsA, i)
                  const pB = passagem(l.countsB, i)
                  const d = pA != null && pB != null ? pB - pA : null
                  return (
                    <td key={k} title={`${COL_LABEL[k]}: ${formatNumber(l.countsA[i])} → ${formatNumber(l.countsB[i])} leads · passagem ${fmtPct(pA)} → ${fmtPct(pB)} (${fmtDeltaPp(d)})`} className={`px-1.5 py-1.5 text-center tabular-nums align-middle rounded ${corMudanca(d, small)} ${isSel ? 'ring-1 ring-indigo-300' : ''}`}>
                      <div className="leading-tight">
                        <span className="text-xs opacity-70">{fmtPct(pA)}</span>
                        <span className="opacity-40 mx-0.5">→</span>
                        <span className="text-sm font-semibold">{fmtPct(pB)}</span>
                      </div>
                      <div className="text-[10px] leading-none tabular-nums opacity-50 mt-0.5">
                        {formatNumber(l.countsA[i])}<span className="mx-0.5">→</span>{formatNumber(l.countsB[i])}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}

          {/* Linha de TOTAL */}
          {linhas.length > 1 && (
            <tr>
              <td className="sticky left-0 z-10 px-2 py-1.5 rounded-l-lg text-left align-middle bg-slate-800">
                <span className="text-sm font-bold text-white whitespace-nowrap">Total</span>
              </td>
              {MARCO_KEYS.map((k, i) => {
                if (i === 0) {
                  return (
                    <td key={k} className="px-1.5 py-2 text-center tabular-nums align-middle rounded bg-slate-800 text-white">
                      <span className="text-xs text-slate-300">{formatNumber(tot.entrouA)}</span>
                      <span className="text-slate-400 mx-0.5">→</span>
                      <span className="text-sm font-bold">{formatNumber(tot.entrouB)}</span>
                    </td>
                  )
                }
                const pA = passagem(tot.countsA, i)
                const pB = passagem(tot.countsB, i)
                return (
                  <td key={k} className="px-1.5 py-1.5 text-center tabular-nums align-middle rounded bg-slate-800 text-white">
                    <div className="leading-tight">
                      <span className="text-xs text-slate-300">{fmtPct(pA)}</span>
                      <span className="text-slate-400 mx-0.5">→</span>
                      <span className="text-sm font-bold">{fmtPct(pB)}</span>
                    </div>
                    <div className="text-[10px] leading-none tabular-nums text-slate-300 mt-0.5">
                      {formatNumber(tot.countsA[i])}<span className="mx-0.5">→</span>{formatNumber(tot.countsB[i])}
                    </div>
                  </td>
                )
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ───────────────────────── Mini-funis ─────────────────────────
function FunisView({ linhas, dim, selecionado, onPick, pequena }: ViewProps) {
  const BARRA_H = 52
  const tot = somaTotal(linhas)
  const totFechaPct = tot.entrouB > 0 ? (tot.countsB[5] / tot.entrouB) * 100 : null
  return (
    <div className="space-y-1.5">
      {linhas.map((l) => {
        const isSel = selecionado === l.bucket
        const small = pequena(l)
        return (
          <button key={l.bucket} onClick={() => onPick(dim, l.bucket)} className={`w-full text-left rounded-lg border px-3 py-2.5 transition ${isSel ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'} ${small ? 'opacity-70' : ''}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-sm font-medium ${isSel ? 'text-indigo-800' : 'text-slate-800'}`}>{l.bucket}</span>
              {small && <span className="px-1 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">poucos</span>}
              <span className="ml-auto text-xs text-slate-400 tabular-nums">{formatNumber(l.entrouB)} leads · fecha {fmtPct(l.taxaB)}</span>
            </div>
            <div className="flex items-end gap-1.5" style={{ height: BARRA_H }}>
              {MARCO_KEYS.map((k, i) => {
                const cumB = cumPct(l.countsB[i], l.entrouB)
                const pB = passagem(l.countsB, i)
                const h = Math.max(3, Math.round(((cumB ?? 0) / 100) * BARRA_H))
                const cor = i === 0 ? 'bg-slate-300' : corBarra(pB, small)
                return (
                  <div key={k} className="flex-1 flex flex-col items-center justify-end" title={`${COL_LABEL[k]}: ${formatNumber(l.countsB[i])} (${fmtPct(cumB)} do total${i > 0 ? `, ${fmtPct(pB)} avançou` : ''})`}>
                    <div className={`w-full rounded-t ${cor}`} style={{ height: h }} />
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {MARCO_KEYS.map((k, i) => (
                <div key={k} className="flex-1 text-center">
                  <div className="text-xs tabular-nums text-slate-600 font-medium">{i === 0 ? formatNumber(l.entrouB) : fmtPct(cumPct(l.countsB[i], l.entrouB))}</div>
                  <div className="text-xs text-slate-400 leading-tight truncate">{COL_LABEL[k]}</div>
                </div>
              ))}
            </div>
          </button>
        )
      })}

      {/* Card de TOTAL — agregado de todos os perfis */}
      {linhas.length > 1 && (
        <div className="w-full text-left rounded-lg border-2 border-slate-800 bg-slate-50 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-bold text-slate-900">Total</span>
            <span className="ml-auto text-xs text-slate-500 tabular-nums">{formatNumber(tot.entrouB)} leads · fecha {fmtPct(totFechaPct)}</span>
          </div>
          <div className="flex items-end gap-1.5" style={{ height: BARRA_H }}>
            {MARCO_KEYS.map((k, i) => {
              const cumB = cumPct(tot.countsB[i], tot.entrouB)
              const h = Math.max(3, Math.round(((cumB ?? 0) / 100) * BARRA_H))
              return (
                <div key={k} className="flex-1 flex flex-col items-center justify-end" title={`${COL_LABEL[k]}: ${formatNumber(tot.countsB[i])} (${fmtPct(cumB)} do total)`}>
                  <div className="w-full rounded-t bg-slate-700" style={{ height: h }} />
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {MARCO_KEYS.map((k, i) => (
              <div key={k} className="flex-1 text-center">
                <div className="text-xs tabular-nums text-slate-800 font-bold">{formatNumber(tot.countsB[i])}</div>
                <div className="text-[10px] tabular-nums text-slate-400">{i === 0 ? '100%' : fmtPct(cumPct(tot.countsB[i], tot.entrouB))}</div>
                <div className="text-xs text-slate-400 leading-tight truncate">{COL_LABEL[k]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
