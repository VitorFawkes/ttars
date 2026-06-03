import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { FilterBar, type TabProps, type AppliedFilters } from '../components/FilterBar'
import { useWwQualidadeLead, type WwQualidadeLead, type WwQualidadeCategoria, type WwPerfilCompareDimensao } from '@/hooks/analyticsWeddings/useWw2'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { ClickableRow } from '../components/ClickableRow'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { MatrixHeatmap } from '../components/MatrixHeatmap'
import { PerfilCompareChart } from '../components/PerfilCompareChart'
import { formatNumber } from '../lib/format'

const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']
const CONV_ORDER = ['Apenas o casal', 'Até 20', '20-50', '50-80', '80-100', '+100']

// Stage default em throughput: "Reunião Agendada" (primeira etapa do funil Closer)
const DEFAULT_EVENT_STAGE_ID = 'ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1'

type Dim = 'faixa' | 'destino' | 'convidados' | 'origem' | 'tipo'

export function Qualidade({ filters, onFiltersChange }: TabProps) {
  return (
    <div className="space-y-4">
      <FilterBar value={filters} onChange={onFiltersChange} show={['period', 'dateMode', 'tipo', 'origem']} />
      <QualidadeContent filters={filters} />
    </div>
  )
}

function QualidadeContent({ filters }: { filters: AppliedFilters }) {
  const { pipelineId } = useCurrentProductMeta()
  const { data: stages } = usePipelineStages(pipelineId ?? undefined)
  const [eventStageId, setEventStageId] = useState<string>(DEFAULT_EVENT_STAGE_ID)
  const [minAmostra, setMinAmostra] = useState<number>(3)
  const [perfilDim, setPerfilDim] = useState<Dim>('faixa')
  const [drill, setDrill] = useState<DrillContext | null>(null)
  const isThroughput = filters.dateMode === 'throughput'

  const stagesSelecionaveis = useMemo(() => {
    if (!stages) return []
    return stages.filter(s => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const phaseSlug = (s as any).pipeline_phases?.slug
      if (phaseSlug === 'resolucao' || phaseSlug === 'sdr') return false
      return true
    })
  }, [stages])

  const { data, isLoading, error } = useWwQualidadeLead(filters, eventStageId, minAmostra)
  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }

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
  const perfilCompare = data.comparacao_entrada_vs_fechamento ?? []
  const perfilAtual: WwPerfilCompareDimensao | undefined = perfilCompare.find(d => d.dimensao === perfilDim)

  return (
    <div className="space-y-5">
      <StageSelector isThroughput={isThroughput} stages={stagesSelecionaveis} value={eventStageId} onChange={setEventStageId} />
      <Controls minAmostra={minAmostra} onMinAmostra={setMinAmostra} data={data} />
      <UniversoHeader data={data} isThroughput={isThroughput} stageNome={stageNome} />

      {/* Perfil de quem entra vs quem fecha */}
      {perfilCompare.length > 0 && (
        <SectionCard
          title="🎯 Quem ENTRA × quem FECHA"
          subtitle="Pra cada categoria, comparamos o % de leads que entraram com o % de vendas que fecharam. Lift = quanto a categoria fecha relativamente à média. Verde = sobre-representada nos fechamentos."
        >
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {(['faixa','destino','convidados','origem','tipo'] as Dim[]).map(d => (
              <button
                key={d}
                onClick={() => setPerfilDim(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${perfilDim === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
              >
                {labelDim(d)}
              </button>
            ))}
          </div>
          {perfilAtual && perfilAtual.dados.length > 0 ? (
            <PerfilCompareChart
              dados={perfilAtual.dados}
              dimensao={perfilDim}
              minSample={1}
              onCategoriaClick={(cat) => setDrill(buildDrillForDim(baseCtx, perfilDim, cat))}
            />
          ) : (
            <EmptyState message="Sem dados suficientes nessa dimensão" />
          )}
        </SectionCard>
      )}

      <FunilPorCategoria
        title="💰 Por faixa de investimento declarada"
        subtitle={isThroughput
          ? `Dos leads que chegaram em ${stageNome} no período, quantos fecharam — agrupados pela faixa que declararam no site.`
          : `Dos leads que entraram no período, quantos fecharam — agrupados pela faixa declarada no site.`}
        items={data.por_faixa}
        unidade="faixa"
        outros={data.outros_amostra_pequena?.faixa}
        onRowClick={(cat) => setDrill({ ...baseCtx, faixa: cat, title: `Casais — faixa "${cat}"` })}
      />
      <FunilPorCategoria
        title="🏝️  Por destino declarado"
        subtitle={isThroughput
          ? `Dos leads que chegaram em ${stageNome} no período, quantos fecharam — por destino declarado.`
          : `Dos leads que entraram no período, quantos fecharam — por destino declarado.`}
        items={data.por_destino}
        unidade="destino"
        outros={data.outros_amostra_pequena?.destino}
        onRowClick={(cat) => setDrill({ ...baseCtx, destino: cat, title: `Casais — destino "${cat}"` })}
      />
      <FunilPorCategoria
        title="👥 Por número de convidados declarado"
        subtitle={isThroughput
          ? `Dos leads que chegaram em ${stageNome} no período, quantos fecharam — por tamanho de celebração.`
          : `Dos leads que entraram no período, quantos fecharam — por tamanho de celebração.`}
        items={data.por_convidados}
        unidade="convidados"
        outros={data.outros_amostra_pequena?.convidados}
        onRowClick={(cat) => setDrill({ ...baseCtx, title: `Casais — ${cat} convidados`, /* convidados não tem filtro server-side ainda */ })}
      />

      <HeatmapFaixaDestino data={data} onCellClick={(faixa, destino) => setDrill({ ...baseCtx, faixa, destino, title: `Casais — ${faixa} × ${destino}` })} />

      {/* Cruzamentos novos */}
      {data.cruzamentos?.faixa_x_origem && data.cruzamentos.faixa_x_origem.length > 0 && (
        <SectionCard
          title="💰 × 🎯  Faixa × Origem"
          subtitle="Linha = faixa que o casal declarou. Coluna = origem do lead. Cada célula = % que fechou. Identifica qual fonte traz lead de cada faixa."
        >
          <MatrixHeatmap
            cells={data.cruzamentos.faixa_x_origem}
            rowsOrder={FAIXA_ORDER}
            rowLabel="Faixa"
            colLabel="Origem"
            onCellClick={(faixa, origem) => setDrill({ ...baseCtx, faixa, origem, title: `Casais — ${faixa} via ${origem}` })}
          />
        </SectionCard>
      )}

      {data.cruzamentos?.destino_x_origem && data.cruzamentos.destino_x_origem.length > 0 && (
        <SectionCard
          title="🏝️ × 🎯  Destino × Origem"
          subtitle="Qual destino tem mais leads de qual fonte? % é taxa de fechamento."
        >
          <MatrixHeatmap
            cells={data.cruzamentos.destino_x_origem}
            rowLabel="Destino"
            colLabel="Origem"
            onCellClick={(destino, origem) => setDrill({ ...baseCtx, destino, origem, title: `Casais — ${destino} via ${origem}` })}
          />
        </SectionCard>
      )}

      {data.cruzamentos?.faixa_x_tipo && data.cruzamentos.faixa_x_tipo.length > 0 && (
        <SectionCard
          title="💰 × 👰  Faixa × Tipo de casamento"
          subtitle="DW vs Elopment dentro de cada faixa de investimento."
        >
          <MatrixHeatmap
            cells={data.cruzamentos.faixa_x_tipo}
            rowsOrder={FAIXA_ORDER}
            rowLabel="Faixa"
            colLabel="Tipo"
            onCellClick={(faixa, tipo) => setDrill({ ...baseCtx, faixa, tipo, title: `Casais — ${faixa} (${tipo})` })}
          />
        </SectionCard>
      )}

      {data.cruzamentos?.convidados_x_origem && data.cruzamentos.convidados_x_origem.length > 0 && (
        <SectionCard
          title="👥 × 🎯  Convidados × Origem"
          subtitle="Tamanho da celebração que cada fonte traz."
        >
          <MatrixHeatmap
            cells={data.cruzamentos.convidados_x_origem}
            rowsOrder={CONV_ORDER}
            rowLabel="Convidados"
            colLabel="Origem"
            onCellClick={(_conv, origem) => setDrill({ ...baseCtx, origem, title: `Casais — origem ${origem}` })}
          />
        </SectionCard>
      )}

      {/* Evolução mensal por faixa */}
      {data.evolucao_mensal_por_faixa && data.evolucao_mensal_por_faixa.length > 0 && (
        <EvolucaoMensalFaixa items={data.evolucao_mensal_por_faixa} />
      )}

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function buildDrillForDim(baseCtx: { dateStart: string; dateEnd: string }, dim: Dim, cat: string): DrillContext {
  const title = `Casais — ${labelDim(dim)} "${cat}"`
  switch (dim) {
    case 'faixa':      return { ...baseCtx, faixa: cat, title }
    case 'destino':    return { ...baseCtx, destino: cat, title }
    case 'origem':     return { ...baseCtx, origem: cat, title }
    case 'tipo':       return { ...baseCtx, tipo: cat, title }
    case 'convidados': return { ...baseCtx, title }
    default:           return { ...baseCtx, title }
  }
}

function labelDim(d: Dim): string {
  switch (d) {
    case 'faixa': return 'Faixa'
    case 'destino': return 'Destino'
    case 'convidados': return 'Convidados'
    case 'origem': return 'Origem'
    case 'tipo': return 'Tipo'
  }
}

function Controls({ minAmostra, onMinAmostra, data }: { minAmostra: number; onMinAmostra: (v: number) => void; data: WwQualidadeLead }) {
  const outros = data.outros_amostra_pequena
  const escondidasFaixa = outros?.faixa?.categorias_agrupadas?.length ?? 0
  const escondidasDestino = outros?.destino?.categorias_agrupadas?.length ?? 0
  const escondidasConv = outros?.convidados?.categorias_agrupadas?.length ?? 0
  const totalEscondidas = escondidasFaixa + escondidasDestino + escondidasConv
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3 flex-wrap text-xs">
      <span className="font-medium text-slate-700">Esconder categorias com menos de</span>
      {[2, 3, 5, 10].map(n => (
        <button
          key={n}
          onClick={() => onMinAmostra(n)}
          className={`px-2.5 py-1 rounded-md border transition ${minAmostra === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
        >
          {n} leads
        </button>
      ))}
      {totalEscondidas > 0 && (
        <span className="text-slate-500">
          · <strong className="text-slate-700">{totalEscondidas}</strong> categoria{totalEscondidas !== 1 ? 's' : ''} agrupada{totalEscondidas !== 1 ? 's' : ''} em "Outros (amostra pequena)"
        </span>
      )}
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

function FunilPorCategoria({ title, subtitle, items, unidade, outros, onRowClick }: {
  title: string; subtitle: string; items: WwQualidadeCategoria[]; unidade: 'faixa' | 'destino' | 'convidados'
  outros?: { entraram: number | null; fecharam: number | null; categorias_agrupadas: string[] | null }
  onRowClick?: (categoria: string) => void
}) {
  if (items.length === 0 && (!outros || !outros.entraram)) {
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

  const hasOutros = outros && outros.entraram && outros.entraram > 0

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-center font-medium">Categoria que o lead declarou</th>
              <th className="px-3 py-2 text-center font-medium" style={{ minWidth: 220 }}>Entraram no período</th>
              <th className="px-3 py-2 text-center font-medium">Fecharam contrato</th>
              <th className="px-3 py-2 text-center font-medium" style={{ minWidth: 160 }}>Taxa de conversão</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(it => {
              const pctEntraram = (it.entraram / maxEntraram) * 100
              const taxa = it.taxa_pct ?? 0
              const taxaBarPct = (taxa / maxTaxa) * 100
              const taxaCor = taxa >= 5 ? 'bg-emerald-500' : taxa >= 2 ? 'bg-indigo-500' : taxa >= 1 ? 'bg-amber-400' : 'bg-rose-300'
              const cells = (
                <>
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
                </>
              )
              return onRowClick ? (
                <ClickableRow
                  key={it.categoria}
                  onClick={() => onRowClick(it.categoria)}
                  className="border-t border-slate-100"
                  title={`Ver casais — ${it.categoria}`}
                >
                  {cells}
                </ClickableRow>
              ) : (
                <tr key={it.categoria} className="border-t border-slate-100">{cells}</tr>
              )
            })}
            {hasOutros && (
              <tr className="border-t border-slate-100 bg-slate-50/50">
                <td className="px-3 py-2 text-slate-500 italic" title={(outros?.categorias_agrupadas ?? []).join(', ')}>
                  Outros (amostra pequena) — {outros?.categorias_agrupadas?.length ?? 0} categoria{(outros?.categorias_agrupadas?.length ?? 0) !== 1 ? 's' : ''}
                </td>
                <td className="px-3 py-2 text-slate-500 text-right tabular-nums">{formatNumber(outros?.entraram ?? 0)}</td>
                <td className="px-3 py-2 text-slate-500 text-right tabular-nums">{formatNumber(outros?.fecharam ?? 0)}</td>
                <td className="px-3 py-2 text-slate-400 text-xs italic">amostra insuficiente</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function HeatmapFaixaDestino({ data, onCellClick }: { data: WwQualidadeLead; onCellClick?: (faixa: string, destino: string) => void }) {
  const heatmap = data.heatmap_faixa_destino
  if (!heatmap || heatmap.length === 0) {
    return (
      <SectionCard title="🔥 Combos faixa × destino" subtitle="Sem combinações suficientes (mínimo 2 leads por combo).">
        <EmptyState message="Sem dados" />
      </SectionCard>
    )
  }
  const cells = heatmap.map(h => ({
    linha: h.faixa, coluna: h.destino,
    entraram: h.entraram, fecharam: h.fecharam,
    taxa_pct: h.taxa_pct,
  }))
  return (
    <SectionCard
      title="🔥 Combos faixa × destino — onde a conversão acontece"
      subtitle="Linha = faixa de investimento que o lead declarou. Coluna = destino que o lead declarou. % na célula = taxa de fechamento."
    >
      <MatrixHeatmap
        cells={cells}
        rowsOrder={FAIXA_ORDER}
        rowLabel="Faixa"
        colLabel="Destino"
        onCellClick={onCellClick}
      />
    </SectionCard>
  )
}

function EvolucaoMensalFaixa({ items }: { items: { mes: string; categoria: string; entraram: number; fecharam: number; taxa_pct: number | null }[] }) {
  // Pivot para Recharts: [{ mes: '2026-01', 'Até R$50 mil': 12, 'R$50-100 mil': 8, ... }]
  const allMeses = Array.from(new Set(items.map(i => i.mes))).sort()
  const allFaixas = FAIXA_ORDER.filter(f => items.some(i => i.categoria === f))
  const data = allMeses.map(mes => {
    const row: Record<string, number | string> = { mes }
    allFaixas.forEach(f => {
      const it = items.find(i => i.mes === mes && i.categoria === f)
      row[f] = it?.entraram ?? 0
    })
    return row
  })
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444']
  return (
    <SectionCard
      title="📅 Evolução mensal por faixa"
      subtitle="Quantos leads de cada faixa entraram em cada mês. Detecta tendências (faixa subindo, faixa caindo)."
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="mes" stroke="#64748b" fontSize={11} />
          <YAxis stroke="#64748b" fontSize={11} />
          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {allFaixas.map((f, i) => (
            <Line key={f} type="monotone" dataKey={f} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </SectionCard>
  )
}
