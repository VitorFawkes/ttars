import { useState } from 'react'
import type { WwFunilRanking, WwFunilRankingDim, WwFunilRankingRow, WwFunilFilterOptions } from '@/hooks/analyticsWeddings/useWw2'
import { fmtPct } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { EmptyState, LoadingSkeleton } from './ui'

// Canais existem no tipo da dimensão, mas o cruzamento A/B trabalha só com os 3 eixos de perfil
// (agrupar "Vídeo+WhatsApp" em A/B não responde pergunta nenhuma — canal cruza no Lead ideal).
const DIM_LABEL: Record<WwFunilRankingDim, string> = {
  faixa: 'Investimento',
  convidados: 'Convidados',
  destino: 'Destino',
  canal_sdr: '1ª reunião',
  canal_closer: 'Reunião fechamento',
}

// Ordem lógica (ranges) — as opções vêm alfabéticas, aqui ordenamos pra leitura.
const ORDEM: Record<WwFunilRankingDim, string[]> = {
  convidados: ['Apenas o casal', 'Até 20', '20-50', '50-100', '50-80', '80-100', '+100'],
  faixa: ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil'],
  destino: [],
  canal_sdr: [],
  canal_closer: [],
}

type Grupo = 0 | 1 | -1 // A | B | fora
const GRUPO_LABEL = ['Grupo A', 'Grupo B']

function bucketsDe(dim: WwFunilRankingDim, options: WwFunilFilterOptions | undefined): string[] {
  const disponiveis = dim === 'faixa' ? options?.faixas
    : dim === 'convidados' ? options?.convidados
    : dim === 'canal_sdr' ? options?.canais_sdr
    : dim === 'canal_closer' ? options?.canais_closer
    : options?.destinos
  const set = new Set(disponiveis ?? [])
  const ord = ORDEM[dim].filter((b) => set.has(b))
  const resto = (disponiveis ?? []).filter((b) => !ORDEM[dim].includes(b))
  return [...ord, ...resto]
}

// Split inicial: primeira metade no Grupo A, segunda no Grupo B.
function splitInicial(buckets: string[]): Record<string, Grupo> {
  const meio = Math.ceil(buckets.length / 2)
  const r: Record<string, Grupo> = {}
  buckets.forEach((b, i) => { r[b] = i < meio ? 0 : 1 })
  return r
}

function bucketDaRow(row: WwFunilRankingRow, dim: WwFunilRankingDim): string | null {
  return (dim === 'faixa' ? row.faixa
    : dim === 'convidados' ? row.convidados
    : dim === 'canal_sdr' ? row.canal_sdr
    : dim === 'canal_closer' ? row.canal_closer
    : row.destino) ?? null
}

function corCelula(taxa: number | null): string {
  if (taxa == null) return 'bg-slate-50 text-slate-400'
  if (taxa >= 15) return 'bg-emerald-100 text-emerald-900'
  if (taxa >= 8) return 'bg-emerald-50 text-emerald-800'
  if (taxa >= 3) return 'bg-amber-50 text-amber-800'
  return 'bg-rose-50 text-rose-700'
}

type Props = {
  eixoX: WwFunilRankingDim
  eixoY: WwFunilRankingDim
  onEixos: (x: WwFunilRankingDim, y: WwFunilRankingDim) => void
  options: WwFunilFilterOptions | undefined
  data: WwFunilRanking | undefined
  isLoading: boolean
  onPickCelula: (eixoX: WwFunilRankingDim, bucketsX: string[], eixoY: WwFunilRankingDim, bucketsY: string[]) => void
}

function Chips({ dim, buckets, grupos, onCycle }: { dim: WwFunilRankingDim; buckets: string[]; grupos: Record<string, Grupo>; onCycle: (b: string) => void }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-600 mb-1.5">{DIM_LABEL[dim]} <span className="font-normal text-slate-400">toque pra agrupar (A → B → fora)</span></div>
      <div className="flex flex-wrap gap-1.5">
        {buckets.map((b) => {
          const g = grupos[b] ?? -1
          const cls = g === 0 ? 'bg-ww-gold-soft text-ww-gold-ink border-ww-gold'
            : g === 1 ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
            : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
          return (
            <button key={b} onClick={() => onCycle(b)} className={`px-2 py-1 text-xs font-medium rounded-lg border transition ${cls}`}>
              <span className="font-bold mr-1">{g === 0 ? 'A' : g === 1 ? 'B' : '—'}</span>{b}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CruzamentoCustom({ eixoX, eixoY, onEixos, options, data, isLoading, onPickCelula }: Props) {
  const bucketsX = bucketsDe(eixoX, options)
  const bucketsY = bucketsDe(eixoY, options)
  // Split inicial em A/B. O componente é remontado (via key no pai) quando muda o
  // eixo ou quando as opções chegam, então o initializer recalcula sem useEffect.
  const [gx, setGx] = useState<Record<string, Grupo>>(() => splitInicial(bucketsX))
  const [gy, setGy] = useState<Record<string, Grupo>>(() => splitInicial(bucketsY))

  const cycle = (which: 'x' | 'y', b: string) => {
    const next = (g: Grupo): Grupo => (g === 0 ? 1 : g === 1 ? -1 : 0)
    if (which === 'x') setGx((p) => ({ ...p, [b]: next(p[b] ?? -1) }))
    else setGy((p) => ({ ...p, [b]: next(p[b] ?? -1) }))
  }

  const membrosX = (g: Grupo) => bucketsX.filter((b) => (gx[b] ?? -1) === g)
  const membrosY = (g: Grupo) => bucketsY.filter((b) => (gy[b] ?? -1) === g)

  // Agrega as células cruas nos grupos definidos.
  const cell = [[{ e: 0, g: 0 }, { e: 0, g: 0 }], [{ e: 0, g: 0 }, { e: 0, g: 0 }]] as { e: number; g: number }[][]
  for (const row of data?.rows ?? []) {
    const bx = bucketDaRow(row, eixoX)
    const by = bucketDaRow(row, eixoY)
    if (bx == null || by == null) continue
    const cgx = gx[bx] ?? -1
    const cgy = gy[by] ?? -1
    if (cgx < 0 || cgy < 0) continue
    cell[cgy][cgx].e += row.entrou
    cell[cgy][cgx].g += row.ganho
  }
  const taxa = (c: { e: number; g: number }) => (c.e > 0 ? (100 * c.g) / c.e : null)

  const dims: WwFunilRankingDim[] = ['faixa', 'convidados', 'destino']

  return (
    <div className="bg-white border border-ww-sand shadow-ww-lift rounded-xl p-5">
      <h3 className="font-ww-serif text-[15px] font-semibold text-ww-n700 tracking-tight mb-1">Cruzamento personalizado</h3>
      <p className="text-xs text-slate-500 mb-4">
        Junte as faixinhas como quiser nos dois eixos pra cada quadrante ter casos de sobra, depois clique num quadrante pra abrir a lista de casais.
      </p>

      {/* eixos */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-xs text-slate-600">Linhas:
          <select value={eixoY} onChange={(e) => onEixos(eixoX, e.target.value as WwFunilRankingDim)}
            className="ml-1 px-2 py-1 text-xs font-medium bg-white border border-slate-200 rounded-lg">
            {dims.filter((d) => d !== eixoX).map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
          </select>
        </label>
        <span className="text-slate-300">×</span>
        <label className="text-xs text-slate-600">Colunas:
          <select value={eixoX} onChange={(e) => onEixos(e.target.value as WwFunilRankingDim, eixoY)}
            className="ml-1 px-2 py-1 text-xs font-medium bg-white border border-slate-200 rounded-lg">
            {dims.filter((d) => d !== eixoY).map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
          </select>
        </label>
      </div>

      {/* group builders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <Chips dim={eixoY} buckets={bucketsY} grupos={gy} onCycle={(b) => cycle('y', b)} />
        <Chips dim={eixoX} buckets={bucketsX} grupos={gx} onCycle={(b) => cycle('x', b)} />
      </div>

      {/* matriz */}
      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (data?.rows?.length ?? 0) === 0 ? (
        <EmptyState message="Sem dados nesse período pra cruzar." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left text-[11px] text-slate-400 font-normal p-1">{DIM_LABEL[eixoY]} \ {DIM_LABEL[eixoX]}</th>
                {[0, 1].map((gxg) => (
                  <th key={gxg} className="text-left text-[11px] text-slate-600 font-medium p-1 align-bottom">
                    <div>{GRUPO_LABEL[gxg]}</div>
                    <div className="text-[10px] text-slate-400 font-normal max-w-[140px] truncate" title={membrosX(gxg as Grupo).join(', ')}>
                      {membrosX(gxg as Grupo).join(' + ') || '—'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1].map((gyg) => (
                <tr key={gyg}>
                  <th className="text-left text-[11px] text-slate-600 font-medium p-1 align-top max-w-[140px]">
                    <div>{GRUPO_LABEL[gyg]}</div>
                    <div className="text-[10px] text-slate-400 font-normal truncate" title={membrosY(gyg as Grupo).join(', ')}>
                      {membrosY(gyg as Grupo).join(' + ') || '—'}
                    </div>
                  </th>
                  {[0, 1].map((gxg) => {
                    const c = cell[gyg][gxg]
                    const t = taxa(c)
                    const poucos = c.e > 0 && c.e < 10
                    const vazio = c.e === 0 || membrosX(gxg as Grupo).length === 0 || membrosY(gyg as Grupo).length === 0
                    return (
                      <td key={gxg} className="p-1">
                        <button
                          disabled={vazio}
                          onClick={() => onPickCelula(eixoX, membrosX(gxg as Grupo), eixoY, membrosY(gyg as Grupo))}
                          className={`w-full rounded-lg p-3 text-left transition ${vazio ? 'bg-slate-50 text-slate-300 cursor-default' : `${corCelula(t)} hover:ring-2 hover:ring-ww-gold`}`}
                        >
                          <div className="text-lg font-semibold tabular-nums">{vazio ? '—' : fmtPct(t)}</div>
                          {!vazio && (
                            <div className="text-[11px] opacity-80 tabular-nums">
                              {formatNumber(c.g)} de {formatNumber(c.e)}
                              {poucos && <span className="ml-1 px-1 rounded bg-amber-100 text-amber-700">poucos casos</span>}
                            </div>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">
        Baseado no que o casal declarou no formulário do site. As faixinhas marcadas "—" ficam de fora do cruzamento.
      </p>
    </div>
  )
}
