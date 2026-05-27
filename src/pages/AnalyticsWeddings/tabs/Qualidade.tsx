import { useMemo, useState } from 'react'
import { useFilterParams } from '../components/FilterBar'
import { useWwQualidadeLead, type WwQualidadeLead, type WwQualidadeCategoria } from '@/hooks/analyticsWeddings/useWw2'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { formatNumber } from '../lib/format'

const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']

// Stage default em throughput: "Reunião Agendada" (primeira etapa do funil Closer)
const DEFAULT_EVENT_STAGE_ID = 'ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1'

export function Qualidade() {
  const filters = useFilterParams()
  const { pipelineId } = useCurrentProductMeta()
  const { data: stages } = usePipelineStages(pipelineId ?? undefined)
  const [eventStageId, setEventStageId] = useState<string>(DEFAULT_EVENT_STAGE_ID)
  const isThroughput = filters.dateMode === 'throughput'

  // Stages relevantes para "entrar no funil de vendas"
  const stagesSelecionaveis = useMemo(() => {
    if (!stages) return []
    return stages.filter(s => {
      // Exclui stages da fase SDR (entrada/qualificação) e Resolução (perdido/cancelado)
      // Mantém Closer (Reunião → Contrato Assinado) e Pós-venda
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const phaseSlug = (s as any).pipeline_phases?.slug
      if (phaseSlug === 'resolucao' || phaseSlug === 'sdr') return false
      return true
    })
  }, [stages])

  const { data, isLoading, error } = useWwQualidadeLead(filters, eventStageId)

  if (isThroughput && !eventStageId) {
    return (
      <div className="space-y-5">
        <StageSelector isThroughput={isThroughput} stages={stagesSelecionaveis} value={eventStageId} onChange={setEventStageId} />
        <EmptyState message="Escolha uma etapa de gatilho acima" />
      </div>
    )
  }
  if (isLoading) return <LoadingSkeleton rows={10} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const stageNome = stagesSelecionaveis.find(s => s.id === eventStageId)?.nome ?? 'etapa'

  return (
    <div className="space-y-5">
      <StageSelector isThroughput={isThroughput} stages={stagesSelecionaveis} value={eventStageId} onChange={setEventStageId} />
      <UniversoHeader data={data} isThroughput={isThroughput} stageNome={stageNome} />
      <FunilPorCategoria
        title="💰 Por faixa de investimento declarada"
        subtitle={isThroughput
          ? `Dos leads que chegaram em ${stageNome} no período, quantos fecharam — agrupados pela faixa que declararam no site.`
          : `Dos leads que entraram no período, quantos fecharam — agrupados pela faixa declarada no site.`}
        items={data.por_faixa}
        unidade="faixa"
      />
      <FunilPorCategoria
        title="🏝️  Por destino declarado"
        subtitle={isThroughput
          ? `Dos leads que chegaram em ${stageNome} no período, quantos fecharam — por destino declarado.`
          : `Dos leads que entraram no período, quantos fecharam — por destino declarado.`}
        items={data.por_destino}
        unidade="destino"
      />
      <FunilPorCategoria
        title="👥 Por número de convidados declarado"
        subtitle={isThroughput
          ? `Dos leads que chegaram em ${stageNome} no período, quantos fecharam — por tamanho de celebração.`
          : `Dos leads que entraram no período, quantos fecharam — por tamanho de celebração.`}
        items={data.por_convidados}
        unidade="convidados"
      />
      <Heatmap data={data} />
    </div>
  )
}

function StageSelector({ isThroughput, stages, value, onChange }: {
  isThroughput: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stages: any[]
  value: string
  onChange: (v: string) => void
}) {
  if (!isThroughput) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
        Modo <strong>Data de criação</strong> — universo são leads pelo dia em que foram criados.
        Pra ver "leads que chegaram em uma etapa específica no período", troque pra <strong>Data de evento</strong> na barra de filtros.
      </div>
    )
  }
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
      <label className="text-xs font-medium text-indigo-900 whitespace-nowrap">
        🎯 Universo = leads que entraram em:
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 text-xs font-medium bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-900"
      >
        {stages.map(s => (
          <option key={s.id} value={s.id}>{s.nome}</option>
        ))}
      </select>
      <span className="text-[11px] text-indigo-700">
        dentro do período selecionado (independente de quando o lead foi criado).
      </span>
    </div>
  )
}

function UniversoHeader({ data, isThroughput, stageNome }: { data: WwQualidadeLead; isThroughput: boolean; stageNome: string }) {
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div className="max-w-3xl">
          <h2 className="text-base font-semibold text-slate-900">🎯 Qualidade do lead</h2>
          <p className="text-sm text-slate-600 mt-1">
            {isThroughput ? (
              <>
                <strong>{formatNumber(data.total_entraram)} leads</strong> chegaram em <strong>{stageNome}</strong> no período,
                <strong className="text-emerald-700"> {formatNumber(data.total_fecharam)} já fecharam</strong> contrato
                <span className="text-slate-500"> · taxa de conversão {stageNome} → venda: </span>
                <strong className="text-indigo-700">{data.taxa_conversao_geral_pct ?? 0}%</strong>
              </>
            ) : (
              <>
                <strong>{formatNumber(data.total_entraram)} leads</strong> entraram no período,
                <strong className="text-emerald-700"> {formatNumber(data.total_fecharam)} fecharam</strong>
                <span className="text-slate-500"> · taxa de conversão geral </span>
                <strong className="text-indigo-700">{data.taxa_conversao_geral_pct ?? 0}%</strong>
              </>
            )}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Cobertura do formulário do site: <strong>{data.cobertura.com_faixa}</strong> com faixa,
            {' '}<strong>{data.cobertura.com_destino}</strong> com destino,
            {' '}<strong>{data.cobertura.com_convidados}</strong> com nº convidados.
          </p>
        </div>
        <div className="text-xs bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-indigo-700 whitespace-nowrap">
          📅 {isThroughput ? <>Data de evento (entrada em <strong>{stageNome}</strong>)</> : <strong>Data de criação do lead</strong>}
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
              <th className="px-3 py-2 text-left font-medium">Categoria que o lead declarou</th>
              <th className="px-3 py-2 text-left font-medium" style={{ minWidth: 220 }}>Entraram no período</th>
              <th className="px-3 py-2 text-right font-medium">Fecharam contrato</th>
              <th className="px-3 py-2 text-left font-medium" style={{ minWidth: 160 }}>Taxa de conversão</th>
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
                      <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden relative">
                        <div className="h-full bg-slate-400" style={{ width: `${pctEntraram}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-900 w-14 text-right font-medium">{formatNumber(it.entraram)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900 font-medium tabular-nums">{formatNumber(it.fecharam)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                        <div className={`h-full ${taxaCor}`} style={{ width: `${taxaBarPct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums w-14 text-right font-medium text-slate-900">{taxa}%</span>
                    </div>
                  </td>
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
      title="🔥 Combos faixa × destino — onde a conversão acontece"
      subtitle="Linha = faixa de investimento que o lead declarou. Coluna = destino que o lead declarou. Cada célula mostra entraram → fecharam (taxa). Verde mais escuro = combo de alta conversão. Rosa = entraram mas ninguém fechou."
    >
      <div className="mb-3 flex items-center gap-3 text-[11px] text-slate-500">
        <span>Legenda:</span>
        <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900">≥ 10%</span>
        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">≥ 5%</span>
        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900">≥ 2%</span>
        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900">&lt; 2%</span>
        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-900">0%</span>
      </div>
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
                    <td key={d} className={`px-2 py-2 text-center ${bg}`} style={{ opacity: 0.55 + 0.45 * intensidade }}
                        title={`${cell.entraram} leads entraram, ${cell.fecharam} fecharam (${taxa}%)`}>
                      <div className="font-semibold text-slate-900 text-sm">{taxa}%</div>
                      <div className="text-[10px] text-slate-700 mt-0.5">{cell.entraram} entraram</div>
                      <div className="text-[10px] text-slate-700">{cell.fecharam} fecharam</div>
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
