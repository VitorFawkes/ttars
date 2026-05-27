import { useState } from 'react'
import { useFilterParams } from '../components/FilterBar'
import { useWwLeadIdeal, type WwLeadIdealData, type WwLeadIdealItem } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { LiftBadge } from '../components/LiftBadge'
import { formatNumber } from '../lib/format'

type Dim = 'faixa' | 'destino' | 'convidados'

const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']
const CONV_ORDER = ['Apenas o casal', 'Até 20', '20-50', '50-80', '80-100', '+100']

export function Perfil() {
  const filters = useFilterParams()
  const [historicoMeses, setHistoricoMeses] = useState<number>(12)
  const [drill, setDrill] = useState<DrillContext | null>(null)
  const { data, isLoading, error } = useWwLeadIdeal(filters, historicoMeses, 2)
  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }

  if (isLoading) return <LoadingSkeleton rows={10} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const dims = data.comparacoes
  const dimFaixa = dims.find(d => d.dimensao === 'faixa')
  const dimDestino = dims.find(d => d.dimensao === 'destino')
  const dimConvidados = dims.find(d => d.dimensao === 'convidados')

  return (
    <div className="space-y-5">
      <Header data={data} historicoMeses={historicoMeses} onHistoricoChange={setHistoricoMeses} />

      <DiagnosticoGeral data={data} />

      <ComparacaoDimensao
        titulo="💰 Investimento declarado"
        subtitulo="Faixa que o casal escolheu no site. À esquerda, perfil de quem virou venda no período de referência. À direita, perfil dos leads novos. Lift acima de 1 = pipeline atual tem MAIS dessa categoria; abaixo de 1 = MENOS."
        dim={dimFaixa}
        ordenarPor={FAIXA_ORDER}
        onCategoriaClick={(cat) => setDrill({ ...baseCtx, faixa: cat, title: `Leads novos — faixa "${cat}"` })}
      />

      <ComparacaoDimensao
        titulo="👥 Nº de convidados declarado"
        subtitulo="Tamanho da celebração que o casal indicou no site. Compara o perfil de quem fechou com o perfil dos novos."
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

function Header({ data, historicoMeses, onHistoricoChange }: {
  data: WwLeadIdealData
  historicoMeses: number
  onHistoricoChange: (n: number) => void
}) {
  const dAtualStart = new Date(data.atual_start).toLocaleDateString('pt-BR')
  const dAtualEnd = new Date(data.atual_end).toLocaleDateString('pt-BR')

  const labelHistorico = historicoMeses === 0
    ? 'Todo o histórico'
    : `Últimos ${historicoMeses} meses`

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
      <h2 className="text-base font-semibold text-slate-900">📈 Lead ideal × Pipeline atual</h2>
      <p className="text-sm text-slate-600 mt-1.5">
        O perfil de lead que <strong>historicamente fecha</strong> contrato é o mesmo que está
        <strong> entrando agora</strong>? Use isso pra entender se o marketing continua atraindo o tipo certo.
      </p>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border border-emerald-200 rounded-lg p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-700 font-medium">📐 Referência: quem FECHOU</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {formatNumber(data.total_historico)} <span className="text-sm font-normal text-slate-500">vendas</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{labelHistorico} de fechamentos</div>
        </div>
        <div className="bg-white border border-indigo-200 rounded-lg p-3">
          <div className="text-xs uppercase tracking-wide text-indigo-700 font-medium">🔍 Comparando com: quem ESTÁ ENTRANDO</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {formatNumber(data.total_atual)} <span className="text-sm font-normal text-slate-500">leads novos</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">De {dAtualStart} a {dAtualEnd}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
        <span className="text-slate-700 font-medium">Janela do histórico:</span>
        {[3, 6, 12, 24].map(n => (
          <button
            key={n}
            onClick={() => onHistoricoChange(n)}
            className={`px-2.5 py-1 rounded-md border transition ${historicoMeses === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
          >
            {n} meses
          </button>
        ))}
        <button
          onClick={() => onHistoricoChange(0)}
          className={`px-2.5 py-1 rounded-md border transition ${historicoMeses === 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
        >
          Tudo
        </button>
        <span className="text-slate-400">· O período "agora" segue o filtro do topo da página</span>
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
        Math.abs(it.delta_pp) >= 8 // diferença >= 8 pontos percentuais é relevante
      ) {
        alertas.push({
          dim: d.dimensao,
          cat: it.categoria,
          lift: it.lift,
          delta_pp: it.delta_pp,
          historico_pct: it.historico_pct ?? 0,
          atual_pct: it.atual_pct ?? 0,
        })
      }
    }
  }

  alertas.sort((a, b) => Math.abs(b.delta_pp) - Math.abs(a.delta_pp))
  const top = alertas.slice(0, 6)

  if (top.length === 0) {
    return (
      <SectionCard
        title="✅ Pipeline alinhado com o histórico"
        subtitle="Não detectamos diferenças grandes entre o perfil dos leads novos e o perfil de quem fechou no período de referência."
      >
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-900">
          O marketing continua atraindo o tipo certo. As distribuições por faixa, convidados e destino estão dentro do esperado.
        </div>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="🚨 Onde o pipeline está DIFERENTE do histórico"
      subtitle="Categorias em que o que está entrando agora se afastou de quem historicamente fechava. Se você quer continuar fechando o mesmo tipo de venda, esses são os pontos de atenção do marketing."
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
                Antes era <strong>{a.historico_pct}%</strong> dos fechamentos.
                Agora é <strong>{a.atual_pct}%</strong> dos leads novos.
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
          <div className="col-span-3">Categoria</div>
          <div className="col-span-4 text-right">% de quem FECHOU (referência)</div>
          <div className="col-span-1 text-center">Lift</div>
          <div className="col-span-4">% dos leads que ENTRAM agora</div>
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
