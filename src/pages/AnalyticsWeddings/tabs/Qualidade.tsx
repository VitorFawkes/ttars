import { useFilterParams } from '../components/FilterBar'
import { useWwQualidadeLead, type WwQualidadeLead, type WwQualidadeCategoria } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { formatCurrency, formatNumber } from '../lib/format'

const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']

export function Qualidade() {
  const filters = useFilterParams()
  const { data, isLoading, error } = useWwQualidadeLead(filters)

  if (isLoading) return <LoadingSkeleton rows={10} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  return (
    <div className="space-y-5">
      <UniversoHeader data={data} />
      <FunilPorCategoria
        title="💰 Por faixa de investimento na entrada"
        subtitle="Quanto cada perfil declarado no site converteu em venda — e qual ticket médio o casal acabou contratando."
        items={data.por_faixa}
        unidade="faixa"
      />
      <FunilPorCategoria
        title="🏝️  Por destino na entrada"
        subtitle="Conversão e ticket médio de venda por destino que o casal escolheu no formulário."
        items={data.por_destino}
        unidade="destino"
      />
      <FunilPorCategoria
        title="👥 Por número de convidados na entrada"
        subtitle="Conversão e ticket médio por tamanho de celebração declarado."
        items={data.por_convidados}
        unidade="convidados"
      />
      <Heatmap data={data} />
    </div>
  )
}

function UniversoHeader({ data }: { data: WwQualidadeLead }) {
  const isCohort = data.date_mode === 'cohort'
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">🎯 Qualidade do lead</h2>
          <p className="text-sm text-slate-600 mt-1">
            <strong>{formatNumber(data.total_entraram)} leads</strong>
            {isCohort ? ' entraram' : ' tiveram desfecho'} no período,
            <strong className="text-emerald-700"> {formatNumber(data.total_fecharam)} fecharam</strong>
            <span className="text-slate-500"> · taxa de conversão </span>
            <strong className="text-indigo-700">{data.taxa_conversao_geral_pct ?? 0}%</strong>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Cobertura: {data.cobertura.com_faixa} com faixa, {data.cobertura.com_destino} com destino, {data.cobertura.com_convidados} com nº convidados.
          </p>
        </div>
        <div className="text-xs bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-indigo-700 whitespace-nowrap">
          📅 Modo: <strong>{isCohort ? 'Data de criação (cohort)' : 'Data de evento (throughput)'}</strong>
        </div>
      </div>
    </div>
  )
}

function FunilPorCategoria({ title, subtitle, items, unidade }: {
  title: string; subtitle: string; items: WwQualidadeCategoria[]; unidade: 'faixa' | 'destino' | 'convidados'
}) {
  if (items.length === 0) {
    return (
      <SectionCard title={title} subtitle={subtitle}>
        <EmptyState message="Sem dados suficientes no período" />
      </SectionCard>
    )
  }

  const sorted = unidade === 'faixa' || unidade === 'convidados'
    ? items
    : [...items].sort((a, b) => b.entraram - a.entraram)
  const maxEntraram = Math.max(1, ...sorted.map(s => s.entraram))
  const maxTaxa = Math.max(0.1, ...sorted.map(s => s.taxa_pct ?? 0))

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Categoria</th>
              <th className="px-3 py-2 text-left font-medium" style={{ minWidth: 200 }}>Entraram</th>
              <th className="px-3 py-2 text-right font-medium">Fecharam</th>
              <th className="px-3 py-2 text-left font-medium" style={{ minWidth: 140 }}>Taxa de conversão</th>
              <th className="px-3 py-2 text-right font-medium">Ticket médio</th>
              <th className="px-3 py-2 text-right font-medium">P25 – P75</th>
              <th className="px-3 py-2 text-right font-medium text-slate-400">Amostra</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(it => {
              const pctEntraram = (it.entraram / maxEntraram) * 100
              const taxa = it.taxa_pct ?? 0
              const taxaBarPct = (taxa / maxTaxa) * 100
              const taxaCor = taxa >= 5 ? 'bg-emerald-500' : taxa >= 2 ? 'bg-indigo-500' : taxa >= 1 ? 'bg-amber-400' : 'bg-rose-300'
              return (
                <tr key={it.categoria} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{it.categoria}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                        <div className="h-full bg-slate-400" style={{ width: `${pctEntraram}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-600 w-10 text-right">{it.entraram}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900 font-medium tabular-nums">{it.fecharam}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                        <div className={`h-full ${taxaCor}`} style={{ width: `${taxaBarPct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums w-12 text-right font-medium text-slate-700">{taxa}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-medium">{it.ticket_medio ? formatCurrency(it.ticket_medio) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-500">{it.ticket_p25 && it.ticket_p75 ? `${formatCurrency(it.ticket_p25)} – ${formatCurrency(it.ticket_p75)}` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-400">{it.ticket_amostra}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function Heatmap({ data }: { data: WwQualidadeLead }) {
  const heatmap = data.heatmap_faixa_destino
  if (heatmap.length === 0) {
    return (
      <SectionCard title="🔥 Combos que vendem mais (faixa × destino)" subtitle="Quais combinações de faixa de investimento + destino têm a maior taxa de conversão.">
        <EmptyState message="Sem combinações suficientes (mínimo de 2 leads por combo)" />
      </SectionCard>
    )
  }

  const faixas = FAIXA_ORDER.filter(f => heatmap.some(h => h.faixa === f))
  const destinosSorted = Array.from(new Set(heatmap.map(h => h.destino)))
    .sort((a, b) => heatmap.filter(h => h.destino === b).reduce((s, h) => s + h.entraram, 0) - heatmap.filter(h => h.destino === a).reduce((s, h) => s + h.entraram, 0))
    .slice(0, 10)

  const map = new Map(heatmap.map(h => [`${h.faixa}|${h.destino}`, h]))
  const maxTaxa = Math.max(1, ...heatmap.map(h => h.taxa_pct ?? 0))

  return (
    <SectionCard
      title="🔥 Combos que vendem mais (faixa × destino)"
      subtitle="Cada célula mostra: leads que entraram, fecharam, taxa de conversão e ticket médio. Cor verde = combo de alta conversão."
    >
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-500 sticky left-0 bg-slate-50 z-10">Faixa ↓ / Destino →</th>
              {destinosSorted.map(d => <th key={d} className="px-3 py-2 text-center font-medium text-slate-700">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {faixas.map(fx => (
              <tr key={fx} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap sticky left-0 bg-white">{fx}</td>
                {destinosSorted.map(d => {
                  const cell = map.get(`${fx}|${d}`)
                  if (!cell) return <td key={d} className="px-3 py-2 text-center bg-slate-50 text-slate-300">—</td>
                  const taxa = cell.taxa_pct ?? 0
                  const intensidade = Math.min(1, taxa / maxTaxa)
                  const bg = cell.fecharam === 0 ? 'bg-rose-50' :
                    taxa >= 10 ? 'bg-emerald-200' :
                    taxa >= 5 ? 'bg-emerald-100' :
                    taxa >= 2 ? 'bg-emerald-50' : 'bg-amber-50'
                  return (
                    <td key={d} className={`px-2 py-2 text-center ${bg}`} style={{ opacity: 0.5 + 0.5 * intensidade }}>
                      <div className="font-semibold text-slate-900">{taxa}%</div>
                      <div className="text-[10px] text-slate-600">{cell.entraram} → {cell.fecharam}</div>
                      {cell.ticket_medio && <div className="text-[10px] text-slate-500">{formatCurrency(cell.ticket_medio)}</div>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
