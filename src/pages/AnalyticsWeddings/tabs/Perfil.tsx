import { useState } from 'react'
import { useFilterParams } from '../components/FilterBar'
import { useWwLeadIdeal, type WwLeadIdealData, type WwLeadIdealItem, type WwLeadIdealCruzamentoCell, type WwLeadIdealPerfilTop } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { LiftBadge } from '../components/LiftBadge'
import { formatNumber } from '../lib/format'

type Dim = 'faixa' | 'destino' | 'convidados'
type Cruz = 'faixa_x_convidados' | 'faixa_x_destino' | 'convidados_x_destino'

const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']
const CONV_ORDER = ['Apenas o casal', 'Até 20', '20-50', '50-80', '80-100', '+100']

// Helpers de data — YYYY-MM-DD pra input[type=date]
const toDateInput = (iso: string) => iso.slice(0, 10)
const fromDateInputStart = (s: string) => new Date(s + 'T00:00:00').toISOString()
const fromDateInputEnd = (s: string) => new Date(s + 'T23:59:59').toISOString()
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString() }

export function Perfil() {
  const filters = useFilterParams()

  // Janela "atual" — começa igual ao filtro global mas vira editável
  const [atualStart, setAtualStart] = useState<string>(filters.dateStart)
  const [atualEnd, setAtualEnd]     = useState<string>(filters.dateEnd)
  // Janela "histórico" — independente, default últimos 12 meses
  const [histStart, setHistStart] = useState<string>(monthsAgo(12))
  const [histEnd, setHistEnd]     = useState<string>(new Date().toISOString())

  const [drill, setDrill] = useState<DrillContext | null>(null)
  const [cruz, setCruz] = useState<Cruz>('faixa_x_convidados')

  const { data, isLoading, error } = useWwLeadIdeal({
    atualStart, atualEnd,
    historicoStart: histStart,
    historicoEnd: histEnd,
    minAmostra: 2,
  })

  const baseCtx = { dateStart: atualStart, dateEnd: atualEnd }

  if (isLoading) return <LoadingSkeleton rows={10} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const dims = data.comparacoes
  const dimFaixa = dims.find(d => d.dimensao === 'faixa')
  const dimDestino = dims.find(d => d.dimensao === 'destino')
  const dimConvidados = dims.find(d => d.dimensao === 'convidados')
  const cruzAtual = data.cruzamentos?.[cruz] ?? []
  const topHist = data.top_perfis_historico ?? []
  const topAtual = data.top_perfis_atual ?? []

  const fonteV2 = (data as unknown as { fonte_v2?: string })?.fonte_v2

  return (
    <div className="space-y-5">
      {fonteV2 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
          <div className="flex items-start gap-3">
            <span className="text-emerald-600 text-lg">✨</span>
            <div className="flex-1">
              <p className="font-medium">Histórico vem do ActiveCampaign direto</p>
              <p className="text-emerald-700 text-xs mt-1">
                {data.total_historico} casamentos fechados (universo lógica weddings-kpi.vercel.app) × {data.total_atual} leads novos no CRM.
                Mesma fonte de verdade que o site dashboard usa, agora com perfil de entrada (form do casal: orçamento + convidados + destino).
              </p>
            </div>
          </div>
        </div>
      )}

      <Header
        data={data}
        atualStart={atualStart} atualEnd={atualEnd}
        histStart={histStart} histEnd={histEnd}
        onAtualStart={setAtualStart} onAtualEnd={setAtualEnd}
        onHistStart={setHistStart} onHistEnd={setHistEnd}
      />

      <DiagnosticoGeral data={data} />

      {/* Análise cruzada 2D — heatmap com seletor */}
      <SectionCard
        title="🔍 Análise cruzada — Lead ideal vs Pipeline"
        subtitle="Compare dois cruzamentos lado a lado. Cada célula mostra o % nos fechamentos (referência) e o % nos leads novos. Diferenças destacadas em cor."
      >
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs font-medium text-slate-700">Cruzar:</span>
          {([
            { id: 'faixa_x_convidados', label: '💰 Faixa × 👥 Convidados' },
            { id: 'faixa_x_destino',    label: '💰 Faixa × 🏝️ Destino' },
            { id: 'convidados_x_destino', label: '👥 Convidados × 🏝️ Destino' },
          ] as { id: Cruz; label: string }[]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setCruz(opt.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${cruz === opt.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <HeatmapDuplo
          cells={cruzAtual}
          xOrder={cruz === 'faixa_x_convidados' || cruz === 'faixa_x_destino' ? FAIXA_ORDER : CONV_ORDER}
          yOrder={cruz === 'faixa_x_convidados' ? CONV_ORDER : undefined}
          xLabel={cruz === 'convidados_x_destino' ? 'Convidados' : 'Faixa'}
          yLabel={cruz === 'faixa_x_convidados' ? 'Convidados' : 'Destino'}
          onCellClick={(x, y) => {
            // mapeia (x, y) → filtros do drill
            const ctx: DrillContext = { ...baseCtx, title: `Leads novos — ${x} + ${y}` }
            if (cruz === 'faixa_x_convidados') ctx.faixa = x
            else if (cruz === 'faixa_x_destino') { ctx.faixa = x; ctx.destino = y }
            else if (cruz === 'convidados_x_destino') ctx.destino = y
            setDrill(ctx)
          }}
        />
      </SectionCard>

      {/* Top combos 3D — lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopPerfisCard
          titulo="🏆 Top 10 perfis de quem FECHOU (referência)"
          subtitulo="Combos (faixa + destino + convidados) mais frequentes entre as vendas fechadas no período de referência."
          perfis={topHist}
          accent="emerald"
        />
        <TopPerfisCard
          titulo="📥 Top 10 perfis dos LEADS NOVOS"
          subtitulo="Combos mais frequentes entre quem entrou no período atual."
          perfis={topAtual}
          accent="indigo"
          onPerfilClick={(p) => setDrill({ ...baseCtx, faixa: p.faixa, destino: p.destino, title: `Leads novos — ${p.faixa} + ${p.destino} + ${p.convidados}` })}
        />
      </div>

      <ComparacaoDimensao
        titulo="💰 Investimento declarado"
        subtitulo="À esquerda, perfil de quem fechou no período de referência. À direita, perfil dos leads novos. Lift acima de 1 = pipeline tem MAIS dessa categoria; abaixo de 1 = MENOS."
        dim={dimFaixa}
        ordenarPor={FAIXA_ORDER}
        onCategoriaClick={(cat) => setDrill({ ...baseCtx, faixa: cat, title: `Leads novos — faixa "${cat}"` })}
      />
      <ComparacaoDimensao
        titulo="👥 Nº de convidados declarado"
        subtitulo="Tamanho da celebração que o casal indicou no site."
        dim={dimConvidados}
        ordenarPor={CONV_ORDER}
        onCategoriaClick={undefined}
      />
      <ComparacaoDimensao
        titulo="🏝️ Destino declarado"
        subtitulo="Para onde o casal disse que queria casar."
        dim={dimDestino}
        onCategoriaClick={(cat) => setDrill({ ...baseCtx, destino: cat, title: `Leads novos — destino "${cat}"` })}
      />

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function Header({ data, atualStart, atualEnd, histStart, histEnd, onAtualStart, onAtualEnd, onHistStart, onHistEnd }: {
  data: WwLeadIdealData
  atualStart: string; atualEnd: string
  histStart: string; histEnd: string
  onAtualStart: (v: string) => void
  onAtualEnd: (v: string) => void
  onHistStart: (v: string) => void
  onHistEnd: (v: string) => void
}) {
  const setPresetHist = (months: number) => {
    if (months === 0) {
      onHistStart('2020-01-01T00:00:00.000Z')
    } else {
      onHistStart(monthsAgo(months))
    }
    onHistEnd(new Date().toISOString())
  }

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
      <h2 className="text-base font-semibold text-slate-900">📈 Lead ideal × Pipeline atual</h2>
      <p className="text-sm text-slate-600 mt-1.5">
        O perfil de lead que <strong>fechava antes</strong> é o mesmo que está <strong>entrando agora</strong>?
        Compare dois períodos independentes e descubra se o marketing continua atraindo o tipo certo.
      </p>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Período HISTÓRICO */}
        <div className="bg-white border border-emerald-200 rounded-lg p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-700 font-medium">📐 Referência: quem FECHOU</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {formatNumber(data.total_historico)} <span className="text-sm font-normal text-slate-500">vendas</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Fechamentos que ocorreram no período</div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <input type="date" value={toDateInput(histStart)} onChange={e => onHistStart(fromDateInputStart(e.target.value))} className="px-2 py-1 text-xs border border-slate-300 rounded text-slate-700" />
            <span className="text-xs text-slate-500">até</span>
            <input type="date" value={toDateInput(histEnd)} onChange={e => onHistEnd(fromDateInputEnd(e.target.value))} className="px-2 py-1 text-xs border border-slate-300 rounded text-slate-700" />
          </div>
          <div className="mt-2 flex items-center gap-1 flex-wrap text-[11px]">
            <span className="text-slate-500">Atalhos:</span>
            {[3, 6, 12, 24].map(n => (
              <button key={n} onClick={() => setPresetHist(n)} className="px-2 py-0.5 rounded border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600">
                {n}m
              </button>
            ))}
            <button onClick={() => setPresetHist(0)} className="px-2 py-0.5 rounded border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600">tudo</button>
          </div>
        </div>

        {/* Período ATUAL */}
        <div className="bg-white border border-indigo-200 rounded-lg p-3">
          <div className="text-xs uppercase tracking-wide text-indigo-700 font-medium">🔍 Pipeline: quem ESTÁ ENTRANDO</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {formatNumber(data.total_atual)} <span className="text-sm font-normal text-slate-500">leads novos</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Leads que chegaram no período</div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <input type="date" value={toDateInput(atualStart)} onChange={e => onAtualStart(fromDateInputStart(e.target.value))} className="px-2 py-1 text-xs border border-slate-300 rounded text-slate-700" />
            <span className="text-xs text-slate-500">até</span>
            <input type="date" value={toDateInput(atualEnd)} onChange={e => onAtualEnd(fromDateInputEnd(e.target.value))} className="px-2 py-1 text-xs border border-slate-300 rounded text-slate-700" />
          </div>
          <div className="mt-2 flex items-center gap-1 flex-wrap text-[11px]">
            <span className="text-slate-500">Atalhos:</span>
            {[
              { label: '7d', d: 7 },
              { label: '30d', d: 30 },
              { label: '60d', d: 60 },
              { label: '90d', d: 90 },
            ].map(p => (
              <button key={p.label} onClick={() => {
                const d = new Date(); d.setDate(d.getDate() - p.d)
                onAtualStart(d.toISOString())
                onAtualEnd(new Date().toISOString())
              }} className="px-2 py-0.5 rounded border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600">{p.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DiagnosticoGeral({ data }: { data: WwLeadIdealData }) {
  const alertas: { dim: string; cat: string; lift: number; delta_pp: number; historico_pct: number; atual_pct: number }[] = []
  for (const d of data.comparacoes) {
    for (const it of d.dados) {
      if (
        it.lift !== null &&
        it.delta_pp !== null &&
        it.historico_qtd >= 3 &&
        Math.abs(it.delta_pp) >= 8
      ) {
        alertas.push({
          dim: d.dimensao, cat: it.categoria, lift: it.lift, delta_pp: it.delta_pp,
          historico_pct: it.historico_pct ?? 0, atual_pct: it.atual_pct ?? 0,
        })
      }
    }
  }
  alertas.sort((a, b) => Math.abs(b.delta_pp) - Math.abs(a.delta_pp))
  const top = alertas.slice(0, 6)

  if (top.length === 0) {
    return (
      <SectionCard title="✅ Pipeline alinhado com o histórico" subtitle="Não detectamos diferenças grandes entre o perfil dos leads novos e o perfil de quem fechou.">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-900">
          O marketing continua atraindo o tipo certo. As distribuições por faixa, convidados e destino estão dentro do esperado.
        </div>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="🚨 Onde o pipeline está DIFERENTE do histórico"
      subtitle="Categorias em que o que está entrando agora se afastou de quem historicamente fechava."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {top.map((a) => {
          const subiu = a.delta_pp > 0
          const corBg = subiu ? 'bg-indigo-50 border-indigo-200' : 'bg-amber-50 border-amber-200'
          const corTxt = subiu ? 'text-indigo-900' : 'text-amber-900'
          return (
            <div key={`${a.dim}-${a.cat}`} className={`border rounded-lg p-3 ${corBg}`}>
              <div className="text-xs uppercase tracking-wide text-slate-500">{labelDim(a.dim as Dim)}</div>
              <div className={`text-sm font-semibold ${corTxt} mt-0.5`}>{a.cat}</div>
              <div className="text-xs text-slate-700 mt-2">
                Antes era <strong>{a.historico_pct}%</strong> dos fechamentos. Agora é <strong>{a.atual_pct}%</strong> dos leads novos.
              </div>
              <div className="mt-1.5 text-xs">
                {subiu ? (
                  <span className="text-indigo-700 font-medium">▲ +{a.delta_pp.toFixed(1)} pontos — entra MAIS do que fechava</span>
                ) : (
                  <span className="text-amber-700 font-medium">▼ {a.delta_pp.toFixed(1)} pontos — entra MENOS do que fechava</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

function HeatmapDuplo({ cells, xOrder, yOrder, xLabel, yLabel, onCellClick }: {
  cells: WwLeadIdealCruzamentoCell[]
  xOrder?: string[]
  yOrder?: string[]
  xLabel: string
  yLabel: string
  onCellClick?: (x: string, y: string) => void
}) {
  if (!cells || cells.length === 0) {
    return <EmptyState message="Sem combinações com amostra suficiente" />
  }
  const xs = xOrder ? xOrder.filter(v => cells.some(c => c.x === v)) : Array.from(new Set(cells.map(c => c.x)))
  const ys = yOrder
    ? yOrder.filter(v => cells.some(c => c.y === v))
    : Array.from(new Set(cells.map(c => c.y))).sort((a, b) => {
        const sa = cells.filter(c => c.y === a).reduce((s, c) => s + c.hist_qtd, 0)
        const sb = cells.filter(c => c.y === b).reduce((s, c) => s + c.hist_qtd, 0)
        return sb - sa
      })
  const cellMap = new Map(cells.map(c => [`${c.x}|${c.y}`, c]))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span>Legenda da cor:</span>
        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">pipeline tem MAIS</span>
        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">alinhado</span>
        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900">pipeline tem MENOS</span>
        <span className="text-slate-400">· cada célula mostra: hist% / atual%</span>
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-center font-medium text-slate-500 sticky left-0 bg-slate-50 z-10 whitespace-nowrap">{yLabel} ↓ / {xLabel} →</th>
              {xs.map(x => <th key={x} className="px-3 py-2 text-center font-medium text-slate-700 min-w-[110px]">{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {ys.map(y => (
              <tr key={y} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap sticky left-0 bg-white z-10">{y}</td>
                {xs.map(x => {
                  const cell = cellMap.get(`${x}|${y}`)
                  if (!cell || (cell.hist_qtd === 0 && cell.atual_qtd === 0)) {
                    return <td key={x} className="px-3 py-2 text-center bg-slate-50 text-slate-300">—</td>
                  }
                  const hp = cell.hist_pct ?? 0
                  const ap = cell.atual_pct ?? 0
                  const delta = ap - hp
                  const bg = Math.abs(delta) < 2 ? 'bg-slate-50 text-slate-700'
                    : delta > 0 ? (delta >= 5 ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-50 text-emerald-800')
                    : (delta <= -5 ? 'bg-amber-100 text-amber-900' : 'bg-amber-50 text-amber-800')
                  return (
                    <td key={x} className={`p-0 ${bg}`} title={`Hist: ${cell.hist_qtd} (${hp}%) · Atual: ${cell.atual_qtd} (${ap}%) · Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp`}>
                      {onCellClick ? (
                        <button onClick={() => onCellClick(x, y)} className="w-full h-full px-2 py-2 text-center block cursor-pointer hover:ring-2 hover:ring-indigo-400 focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                          <div className="text-[11px] tabular-nums">
                            <span className="text-emerald-700 font-medium">{hp}%</span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="text-indigo-700 font-medium">{ap}%</span>
                          </div>
                          <div className="text-[10px] opacity-75 mt-0.5">{cell.hist_qtd}→{cell.atual_qtd}</div>
                        </button>
                      ) : (
                        <div className="px-2 py-2 text-center">
                          <div className="text-[11px] tabular-nums">
                            <span className="text-emerald-700 font-medium">{hp}%</span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="text-indigo-700 font-medium">{ap}%</span>
                          </div>
                          <div className="text-[10px] opacity-75 mt-0.5">{cell.hist_qtd}→{cell.atual_qtd}</div>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TopPerfisCard({ titulo, subtitulo, perfis, accent, onPerfilClick }: {
  titulo: string
  subtitulo: string
  perfis: WwLeadIdealPerfilTop[]
  accent: 'emerald' | 'indigo'
  onPerfilClick?: (p: WwLeadIdealPerfilTop) => void
}) {
  const borderCor = accent === 'emerald' ? 'border-emerald-200' : 'border-indigo-200'
  const bgCor = accent === 'emerald' ? 'bg-emerald-50/40' : 'bg-indigo-50/40'

  return (
    <SectionCard title={titulo} subtitle={subtitulo}>
      {perfis.length === 0 ? <EmptyState message="Sem perfis com amostra suficiente" /> : (
        <div className="space-y-2">
          {perfis.map((p, i) => {
            const Wrap = onPerfilClick ? ('button' as const) : ('div' as const)
            return (
              <Wrap
                key={`${p.faixa}-${p.destino}-${p.convidados}-${i}`}
                onClick={onPerfilClick ? () => onPerfilClick(p) : undefined}
                className={`w-full flex items-center gap-3 p-2.5 border ${borderCor} ${bgCor} rounded-lg text-left ${onPerfilClick ? 'hover:bg-white/60 cursor-pointer transition' : ''}`}
              >
                <div className="text-slate-400 font-mono text-xs w-5 text-right">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{p.faixa}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {p.destino} · {p.convidados} convidados
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">{p.qtd}</div>
                  <div className="text-[10px] text-slate-500">{p.pct ?? 0}%</div>
                </div>
              </Wrap>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

function ComparacaoDimensao({ titulo, subtitulo, dim, ordenarPor, onCategoriaClick }: {
  titulo: string
  subtitulo: string
  dim: { dimensao: string; dados: WwLeadIdealItem[] } | undefined
  ordenarPor?: string[]
  onCategoriaClick?: ((categoria: string) => void) | undefined
}) {
  if (!dim || dim.dados.length === 0) {
    return (
      <SectionCard title={titulo} subtitle={subtitulo}>
        <EmptyState message="Sem dados suficientes nessa dimensão" />
      </SectionCard>
    )
  }

  const sorted = ordenarPor
    ? [...dim.dados].sort((a, b) => {
        const ia = ordenarPor.indexOf(a.categoria)
        const ib = ordenarPor.indexOf(b.categoria)
        if (ia === -1 && ib === -1) return b.historico_qtd - a.historico_qtd
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
    : [...dim.dados].sort((a, b) => b.historico_qtd - a.historico_qtd)

  const maxPct = Math.max(5, ...sorted.flatMap(d => [d.historico_pct ?? 0, d.atual_pct ?? 0]))

  return (
    <SectionCard title={titulo} subtitle={subtitulo}>
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="grid grid-cols-12 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-medium tracking-wide text-slate-500">
          <div className="col-span-3 text-center">Categoria</div>
          <div className="col-span-4 text-center">% de quem FECHOU (referência)</div>
          <div className="col-span-1 text-center">Lift</div>
          <div className="col-span-4 text-center">% dos leads que ENTRAM agora</div>
        </div>
        <div className="divide-y divide-slate-100">
          {sorted.map(d => {
            const histPct = d.historico_pct ?? 0
            const atualPct = d.atual_pct ?? 0
            const histBar = (histPct / maxPct) * 100
            const atualBar = (atualPct / maxPct) * 100
            const Wrap = onCategoriaClick ? ('button' as const) : ('div' as const)
            return (
              <Wrap
                key={d.categoria}
                onClick={onCategoriaClick ? () => onCategoriaClick(d.categoria) : undefined}
                className={`w-full grid grid-cols-12 items-center px-3 py-2.5 text-xs text-left ${onCategoriaClick ? 'hover:bg-indigo-50/60 cursor-pointer' : ''}`}
                title={onCategoriaClick ? `Ver leads novos — ${d.categoria}` : undefined}
              >
                <div className="col-span-3 font-medium text-slate-900 truncate" title={d.categoria}>{d.categoria}</div>
                <div className="col-span-4">
                  <div className="flex items-center gap-2 flex-row-reverse">
                    <span className="w-12 text-right tabular-nums text-emerald-700 font-medium">{histPct}%</span>
                    <span className="w-10 text-right text-[10px] text-slate-400 tabular-nums">{d.historico_qtd}</span>
                    <div className="flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
                      <div className="absolute top-0 right-0 h-full bg-emerald-400" style={{ width: `${histBar}%` }} />
                    </div>
                  </div>
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  <LiftBadge lift={d.lift} size="sm" showDelta={false} />
                </div>
                <div className="col-span-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
                      <div className="h-full bg-indigo-400" style={{ width: `${atualBar}%` }} />
                    </div>
                    <span className="w-10 text-left text-[10px] text-slate-400 tabular-nums">{d.atual_qtd}</span>
                    <span className="w-12 text-left tabular-nums text-indigo-700 font-medium">{atualPct}%</span>
                  </div>
                </div>
              </Wrap>
            )
          })}
        </div>
      </div>
    </SectionCard>
  )
}

function labelDim(d: Dim | string): string {
  switch (d) {
    case 'faixa': return 'Faixa de investimento'
    case 'destino': return 'Destino'
    case 'convidados': return 'Nº de convidados'
    default: return d
  }
}
