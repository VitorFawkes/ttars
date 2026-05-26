import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useFilterParams } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatCurrency, formatNumber } from '../lib/format'

type Stats = { com_entrada: number; com_refinado: number; com_ambos: number; manteve: number; mudou: number; com_valor_pacote?: number }
type SumarioOrdenavel = { entrada: string; total: number; manteve: number; subiu: number; desceu: number; pct_manteve: number | null; top_destino: string | null; amostra_suficiente: boolean }
type SumarioDestino = { entrada: string; total: number; manteve: number; mudou: number; pct_manteve: number | null; top_destino: string | null; amostra_suficiente: boolean }
type Transicao = { de: string; para: string; qtd: number }
type ValorPorFaixa = { entrada: string; amostra: number; p25: number | null; mediana: number | null; p75: number | null; media: number | null; minimo: number | null; maximo: number | null; amostra_suficiente: boolean }

type EntradaRealidadeData = {
  total_leads: number
  total_fechados: number
  convidados: { stats: Stats; sumario: SumarioOrdenavel[]; top_transicoes: Transicao[] }
  investimento: { stats: Stats; sumario: SumarioOrdenavel[]; top_transicoes: Transicao[]; valores_por_faixa: ValorPorFaixa[] }
  destino: { stats: Stats; sumario: SumarioDestino[]; top_transicoes: Transicao[]; destino_livre_quando_outro: { texto: string; qtd: number }[] }
  error?: string
}

export function EntradaRealidade() {
  const filters = useFilterParams()
  const { org } = useOrg()
  const [onlyFechados, setOnlyFechados] = useState(false)
  const [drill, setDrill] = useState<DrillContext | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['ww2', 'er-v2', org?.id, filters.dateStart, filters.dateEnd, filters.origins, onlyFechados],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('ww2_entrada_realidade', {
        p_date_start: filters.dateStart,
        p_date_end: filters.dateEnd,
        p_org_id: org?.id,
        p_origins: filters.origins?.length ? filters.origins : null,
        p_only_fechados: onlyFechados,
      })
      if (error) throw error
      return data as EntradaRealidadeData
    },
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  if (isLoading) return <LoadingSkeleton rows={8} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }

  return (
    <div className="space-y-5">
      {/* Header e aviso crítico */}
      <SectionCard
        title="🔄 Entrada × Realidade"
        subtitle="O que o lead disse no formulário do site vs o que a closer refinou depois da reunião — com aviso de honestidade estatística."
        action={
          <button
            onClick={() => setOnlyFechados(!onlyFechados)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              onlyFechados ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {onlyFechados ? '✓ Apenas fechados' : 'Apenas fechados'}
          </button>
        }
      >
        <CoverageBanner data={data} />
      </SectionCard>

      <Dimensao
        title="👥 Convidados — Entrada × Realidade"
        stats={data.convidados.stats}
        sumario={data.convidados.sumario}
        transicoes={data.convidados.top_transicoes}
        onDrill={(e) => setDrill({ ...baseCtx, title: `Leads que disseram "${e}" convidados` })}
        tipoLabel="convidados"
      />

      <Dimensao
        title="💰 Investimento — Entrada × Realidade (faixa)"
        stats={data.investimento.stats}
        sumario={data.investimento.sumario}
        transicoes={data.investimento.top_transicoes}
        onDrill={(e) => setDrill({ ...baseCtx, faixa: e, title: `Leads na faixa ${e}` })}
        tipoLabel="faixa"
      />

      <ValoresPacote valores={data.investimento.valores_por_faixa} stats={data.investimento.stats} />

      <DimensaoDestino
        data={data.destino}
        onDrill={(e) => setDrill({ ...baseCtx, destino: e, title: `Leads que disseram "${e}"` })}
      />

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function CoverageBanner({ data }: { data: EntradaRealidadeData }) {
  const cards = [
    { dim: 'Convidados', s: data.convidados.stats, color: 'indigo' },
    { dim: 'Investimento', s: data.investimento.stats, color: 'emerald' },
    { dim: 'Destino', s: data.destino.stats, color: 'purple' },
  ]
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map(({ dim, s, color }) => {
          const pctRefin = s.com_entrada > 0 ? Math.round(100 * s.com_refinado / s.com_entrada) : 0
          const pctManteve = s.com_ambos > 0 ? Math.round(100 * s.manteve / s.com_ambos) : 0
          const colorClasses: Record<string, string> = {
            indigo: 'from-indigo-50 to-white border-indigo-100',
            emerald: 'from-emerald-50 to-white border-emerald-100',
            purple: 'from-purple-50 to-white border-purple-100',
          }
          return (
            <div key={dim} className={`bg-gradient-to-br ${colorClasses[color]} border rounded-lg p-4`}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{dim}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">Tem entrada</div>
                  <div className="text-lg font-semibold text-slate-900 tabular-nums">{formatNumber(s.com_entrada)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Tem refinado</div>
                  <div className="text-lg font-semibold text-slate-900 tabular-nums">{formatNumber(s.com_refinado)}</div>
                  <div className="text-[10px] text-slate-500">{pctRefin}% dos com entrada</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs">
                <div className="text-slate-500">Universo de análise (tem ambos)</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold text-slate-900 tabular-nums">{formatNumber(s.com_ambos)}</span>
                  <span className="text-slate-500">leads</span>
                </div>
                <div className="mt-1 text-[11px]">
                  <span className="text-emerald-700 font-medium">{s.manteve} mantiveram ({pctManteve}%)</span>
                  <span className="text-slate-400 mx-1">·</span>
                  <span className="text-amber-700 font-medium">{s.mudou} mudaram</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5">
        <strong>⚠ Como ler:</strong> "manteve" significa que a closer confirmou a mesma faixa que o lead marcou no site.
        Taxa de refinamento baixa (ex: 20%) significa que <strong>80% dos leads não têm dado pra comparar</strong> — a análise abaixo cobre só o universo refinado.
        Quanto mais alta a taxa de "manteve", mais o formulário do site está bem ajustado às escolhas reais.
      </div>
    </div>
  )
}

function Dimensao({ title, stats, sumario, transicoes, onDrill, tipoLabel }: {
  title: string
  stats: Stats
  sumario: SumarioOrdenavel[]
  transicoes: Transicao[]
  onDrill: (entrada: string) => void
  tipoLabel: string
}) {
  if (stats.com_ambos < 10) {
    return (
      <SectionCard title={title} subtitle={`Apenas ${stats.com_ambos} leads têm entrada E refinado — amostra insuficiente pra análise séria.`}>
        <EmptyState message={`Universo de análise muito pequeno (${stats.com_ambos} leads). Quando o time refinar mais leads, esta análise fica útil.`} />
      </SectionCard>
    )
  }

  const pctManteve = Math.round(100 * stats.manteve / stats.com_ambos)
  const insight = pctManteve >= 95
    ? `Praticamente todos os leads mantêm a ${tipoLabel} que disseram no formulário. O formulário do site captura bem o intent.`
    : pctManteve >= 80
    ? `A maioria mantém, mas ${stats.mudou} casos ({${100 - pctManteve}%}) mudaram — vale olhar pra onde.`
    : `Muitos leads mudam de ${tipoLabel} entre o formulário e a reunião. O formulário pode estar capturando intent vago.`

  return (
    <SectionCard
      title={title}
      subtitle={`Universo: ${formatNumber(stats.com_ambos)} leads · ${formatNumber(stats.manteve)} mantiveram (${pctManteve}%) · ${formatNumber(stats.mudou)} mudaram`}
    >
      <div className="mb-4 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5">
        💡 <strong>Insight:</strong> {insight}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {sumario.map((s) => <FaixaCard key={s.entrada} s={s} onClick={() => onDrill(s.entrada)} />)}
      </div>

      {transicoes.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="text-xs font-medium text-slate-700 mb-2">Todas as mudanças (de → para):</div>
          <div className="flex flex-wrap gap-2">
            {transicoes.map((t, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 text-xs whitespace-nowrap">
                <span className="text-slate-700">{t.de}</span>
                <span className="text-amber-600 mx-1.5">→</span>
                <span className="font-medium text-slate-900">{t.para}</span>
                <span className="text-slate-500 ml-2 tabular-nums">{t.qtd} {t.qtd === 1 ? 'lead' : 'leads'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

function FaixaCard({ s, onClick }: { s: SumarioOrdenavel; onClick: () => void }) {
  const pct = s.pct_manteve ?? 0
  const corPct = pct >= 95 ? 'text-emerald-700' : pct >= 80 ? 'text-amber-700' : 'text-rose-600'
  const corBg = pct >= 95 ? 'bg-emerald-50 border-emerald-200' : pct >= 80 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'
  const w_manteve = (s.manteve / s.total) * 100
  const w_subiu = (s.subiu / s.total) * 100
  const w_desceu = (s.desceu / s.total) * 100

  return (
    <button onClick={onClick} className={`text-left bg-white border ${corBg} rounded-xl p-4 hover:shadow-md transition`}>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-slate-900">
          {s.entrada}
          {!s.amostra_suficiente && <span className="ml-1.5 text-[10px] text-amber-600 font-normal">amostra pequena</span>}
        </div>
        <div className={`text-xl font-bold tabular-nums ${corPct}`}>{pct}%</div>
      </div>
      <div className="text-[11px] text-slate-500 mb-3">
        {formatNumber(s.total)} {s.total === 1 ? 'lead' : 'leads'} no universo
      </div>

      {/* Barra de distribuição */}
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex mb-2">
        {w_manteve > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${w_manteve}%` }} />}
        {w_subiu > 0 && <div className="bg-amber-400 transition-all" style={{ width: `${w_subiu}%` }} />}
        {w_desceu > 0 && <div className="bg-rose-400 transition-all" style={{ width: `${w_desceu}%` }} />}
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 align-middle" />
          <span className="text-slate-500">Manteve</span>
          <div className="font-semibold text-slate-900 tabular-nums">{formatNumber(s.manteve)}</div>
        </div>
        <div>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 align-middle" />
          <span className="text-slate-500">Subiu</span>
          <div className={`font-semibold tabular-nums ${s.subiu > 0 ? 'text-amber-700' : 'text-slate-300'}`}>{formatNumber(s.subiu)}</div>
        </div>
        <div>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400 mr-1 align-middle" />
          <span className="text-slate-500">Desceu</span>
          <div className={`font-semibold tabular-nums ${s.desceu > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{formatNumber(s.desceu)}</div>
        </div>
      </div>

      {s.top_destino && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-[11px]">
          <span className="text-slate-500">Quando muda, mais comum vai pra: </span>
          <span className="font-medium text-amber-700">{s.top_destino}</span>
        </div>
      )}
    </button>
  )
}

function ValoresPacote({ valores, stats }: { valores: ValorPorFaixa[]; stats: Stats }) {
  if (!valores || valores.length === 0 || (stats.com_valor_pacote ?? 0) < 10) {
    return null
  }
  const globalMax = Math.max(...valores.map(v => v.maximo ?? 0), 1)

  return (
    <SectionCard
      title="💸 Investimento — Valor REAL do pacote por faixa de entrada"
      subtitle={`${stats.com_valor_pacote} contratos com valor de pacote registrado (excluindo outliers <R$5k). Mostra distribuição estatística por faixa que o lead disse no site.`}
    >
      <table className="w-full text-xs">
        <thead className="text-left text-slate-500 border-b border-slate-200">
          <tr>
            <th className="py-2 font-medium">Disse no site</th>
            <th className="py-2 font-medium text-right">n</th>
            <th className="py-2 font-medium text-right">Mín</th>
            <th className="py-2 font-medium text-right">P25</th>
            <th className="py-2 font-medium text-right">Mediana</th>
            <th className="py-2 font-medium text-right">P75</th>
            <th className="py-2 font-medium text-right">Máx</th>
            <th className="py-2 font-medium" style={{ width: '35%' }}>Faixa real (min · p25-p75 · máx)</th>
          </tr>
        </thead>
        <tbody>
          {valores.map((r) => {
            const leftMin = ((r.minimo ?? 0) / globalMax) * 100
            const widthRange = (((r.maximo ?? 0) - (r.minimo ?? 0)) / globalMax) * 100
            const leftP25 = ((r.p25 ?? 0) / globalMax) * 100
            const widthIQR = (((r.p75 ?? 0) - (r.p25 ?? 0)) / globalMax) * 100
            const leftP50 = ((r.mediana ?? 0) / globalMax) * 100
            return (
              <tr key={r.entrada} className="border-b border-slate-100">
                <td className="py-2 font-medium text-slate-900">
                  {r.entrada}
                  {!r.amostra_suficiente && <span className="ml-1 text-[10px] text-amber-600">(n&lt;10)</span>}
                </td>
                <td className="py-2 text-right tabular-nums">{r.amostra}</td>
                <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.minimo ?? 0)}</td>
                <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.p25 ?? 0)}</td>
                <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{formatCurrency(r.mediana ?? 0)}</td>
                <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.p75 ?? 0)}</td>
                <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.maximo ?? 0)}</td>
                <td className="py-2 relative h-6">
                  <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-slate-200 rounded" style={{ left: `${leftMin}%`, width: `${widthRange}%` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 h-2.5 bg-indigo-400 rounded" style={{ left: `${leftP25}%`, width: `${widthIQR}%` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-indigo-900 rounded" style={{ left: `${leftP50}%` }} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-slate-500">
        <span className="inline-block w-3 h-1 bg-slate-200 align-middle mr-1" /> range completo (min-máx) ·
        <span className="inline-block w-3 h-2 bg-indigo-400 align-middle mx-1" /> 50% no meio (p25-p75) ·
        <span className="inline-block w-1 h-3 bg-indigo-900 align-middle mx-1" /> mediana
      </p>
      <div className="mt-3 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded p-2.5">
        💡 <strong>Como ler:</strong> O pacote Welcome cobre só a assessoria/planejamento — não o casamento todo.
        Se quem disse "R$200-500 mil" tem mediana de pacote R$100k, isso significa que pagou ~R$100k pra Welcome, e provavelmente o casamento total ficou entre R$200-500k declarado.
      </div>
    </SectionCard>
  )
}

function DimensaoDestino({ data, onDrill }: {
  data: { stats: Stats; sumario: SumarioDestino[]; top_transicoes: Transicao[]; destino_livre_quando_outro: { texto: string; qtd: number }[] }
  onDrill: (e: string) => void
}) {
  const { stats, sumario, top_transicoes, destino_livre_quando_outro } = data
  if (stats.com_ambos < 10) {
    return (
      <SectionCard title="🏝️ Destino — Entrada × Realidade" subtitle="Amostra insuficiente.">
        <EmptyState message={`Só ${stats.com_ambos} leads têm entrada e destino refinado.`} />
      </SectionCard>
    )
  }

  const pctManteve = Math.round(100 * stats.manteve / stats.com_ambos)
  const insight = pctManteve >= 90
    ? `Destino é a dimensão mais estável: ${pctManteve}% mantêm o que disseram. Os ${stats.mudou} que mudaram revelam ofertas alternativas.`
    : `${stats.mudou} de ${stats.com_ambos} leads mudaram de destino. Veja pra onde estão indo.`

  return (
    <>
      <SectionCard
        title="🏝️ Destino — Entrada × Realidade"
        subtitle={`Universo: ${formatNumber(stats.com_ambos)} leads · ${formatNumber(stats.manteve)} mantiveram (${pctManteve}%) · ${formatNumber(stats.mudou)} mudaram`}
      >
        <div className="mb-4 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5">💡 <strong>Insight:</strong> {insight}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sumario.map((s) => <DestinoCard key={s.entrada} s={s} onClick={() => onDrill(s.entrada)} />)}
        </div>
      </SectionCard>

      {top_transicoes.length > 0 && (
        <SectionCard title="Mudanças de destino (top 10)" subtitle="Casais que disseram um destino e acabaram em outro">
          <div className="flex flex-wrap gap-2">
            {top_transicoes.map((t, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 text-xs">
                <span className="text-slate-700">{t.de}</span>
                <span className="text-amber-600 mx-1">→</span>
                <span className="font-medium text-slate-900">{t.para}</span>
                <span className="text-slate-400 ml-1.5 tabular-nums">×{t.qtd}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {destino_livre_quando_outro.length > 0 && (
        <SectionCard title='✍️ Quem disse "Outro" no formulário — escreveu o quê?' subtitle="Texto livre do que o casal queria.">
          <ul className="space-y-1.5">
            {destino_livre_quando_outro.map((v, i) => (
              <li key={i} className="text-xs text-slate-700 border-l-2 border-indigo-200 pl-2">
                <span className="font-medium tabular-nums text-slate-400 mr-2">×{v.qtd}</span>{v.texto}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </>
  )
}

function DestinoCard({ s, onClick }: { s: SumarioDestino; onClick: () => void }) {
  const pct = s.pct_manteve ?? 0
  const corPct = pct >= 90 ? 'text-emerald-700' : pct >= 70 ? 'text-amber-700' : 'text-rose-600'
  const corBg = pct >= 90 ? 'bg-emerald-50 border-emerald-200' : pct >= 70 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'
  const w_manteve = (s.manteve / s.total) * 100
  const w_mudou = (s.mudou / s.total) * 100

  return (
    <button onClick={onClick} className={`text-left bg-white border ${corBg} rounded-xl p-4 hover:shadow-md transition`}>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-slate-900">
          {s.entrada}
          {!s.amostra_suficiente && <span className="ml-1.5 text-[10px] text-amber-600 font-normal">amostra pequena</span>}
        </div>
        <div className={`text-xl font-bold tabular-nums ${corPct}`}>{pct}%</div>
      </div>
      <div className="text-[11px] text-slate-500 mb-3">
        {formatNumber(s.total)} {s.total === 1 ? 'lead' : 'leads'} no universo
      </div>

      <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex mb-2">
        {w_manteve > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${w_manteve}%` }} />}
        {w_mudou > 0 && <div className="bg-amber-400 transition-all" style={{ width: `${w_mudou}%` }} />}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 align-middle" />
          <span className="text-slate-500">Manteve</span>
          <div className="font-semibold text-slate-900 tabular-nums">{formatNumber(s.manteve)}</div>
        </div>
        <div>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 align-middle" />
          <span className="text-slate-500">Mudou</span>
          <div className={`font-semibold tabular-nums ${s.mudou > 0 ? 'text-amber-700' : 'text-slate-300'}`}>{formatNumber(s.mudou)}</div>
        </div>
      </div>

      {s.top_destino && s.mudou > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-[11px]">
          <span className="text-slate-500">Quando muda, mais comum vai pra: </span>
          <span className="font-medium text-amber-700">{s.top_destino}</span>
        </div>
      )}
    </button>
  )
}
