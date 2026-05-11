import { useMemo } from 'react'
import ChartCard from '@/components/analytics/ChartCard'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'
import { getPhaseColor, relativeDelta, type FunnelMetric } from './constants'
import type { FunnelStageV3 } from './useFunnelData'

interface Props {
  isLoading: boolean
  stages: FunnelStageV3[]
  previousStages: FunnelStageV3[] | null
  metric: FunnelMetric
  compareEnabled: boolean
  onStageDrill: (stageId: string, stageName: string) => void
}

interface RowData {
  stage_id: string
  stage_nome: string
  phase_slug: string
  value: number
  widthPct: number
  pctFromRoot: number
  convFromPrev: number | null
  deltaVsPeriod: number | null
  acumulado: number
  p50: number
  p75: number
  isRoot: boolean
}

function getValueForMetric(stage: FunnelStageV3, metric: FunnelMetric): number {
  if (metric === 'cards') return stage.period_count
  if (metric === 'receita') return stage.period_receita || 0
  return stage.period_valor || 0
}

function formatValue(v: number, metric: FunnelMetric): string {
  if (metric === 'cards') return v.toLocaleString('pt-BR')
  return formatCurrency(v)
}

function DeltaBadge({ value, title }: { value: number | null; title: string }) {
  if (value == null || isNaN(value) || !isFinite(value)) {
    return <span className="text-slate-300 text-[11px]">—</span>
  }
  const up = value > 0
  const down = value < 0
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center tabular-nums text-[11px] font-semibold',
        up && 'text-emerald-600',
        down && 'text-rose-600',
        !up && !down && 'text-slate-500'
      )}
    >
      {value > 0 ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  )
}

export default function FunnelVisual({
  isLoading,
  stages,
  previousStages,
  metric,
  compareEnabled,
  onStageDrill,
}: Props) {
  const rows = useMemo<RowData[]>(() => {
    if (!stages.length) return []

    // Ordem já vem correta da RPC v3 (pp.order_index, s.ordem).
    const sorted = stages

    // Baseline da largura: valor do topo (primeira etapa).
    // Funil verdadeiro converge — downstream ≤ topo. Se não for o caso (dados inesperados),
    // a barra é capada em 100% para não estourar o layout.
    const rootValue = getValueForMetric(sorted[0], metric) || 0

    const prevByStage = new Map<string, FunnelStageV3>()
    if (previousStages) for (const p of previousStages) prevByStage.set(p.stage_id, p)

    let acumulado = 0
    return sorted.map((s, idx) => {
      const value = getValueForMetric(s, metric)
      acumulado += value

      const prevInFunnel = idx > 0 ? sorted[idx - 1] : null
      const prevValueInFunnel = prevInFunnel ? getValueForMetric(prevInFunnel, metric) : null

      const periodPrev = prevByStage.get(s.stage_id)
      const periodPrevValue = periodPrev ? getValueForMetric(periodPrev, metric) : null

      const widthPct = rootValue > 0 ? Math.min(100, (value / rootValue) * 100) : 0

      return {
        stage_id: s.stage_id,
        stage_nome: s.stage_nome,
        phase_slug: s.phase_slug,
        value,
        widthPct,
        pctFromRoot: rootValue > 0 ? (value / rootValue) * 100 : 0,
        convFromPrev:
          prevValueInFunnel != null && prevValueInFunnel > 0
            ? (value / prevValueInFunnel) * 100
            : null,
        deltaVsPeriod: periodPrevValue != null ? relativeDelta(value, periodPrevValue) : null,
        acumulado,
        p50: s.p50_days_in_stage ?? 0,
        p75: s.p75_days_in_stage ?? 0,
        isRoot: idx === 0,
      }
    })
  }, [stages, previousStages, metric])

  // Layout de colunas: Etapa · Barra · %topo · Conv etapa · p50/p75 · [vs anterior]
  const gridCols = compareEnabled
    ? 'minmax(200px, 240px) minmax(320px, 1fr) 78px 96px 96px 88px'
    : 'minmax(200px, 240px) minmax(320px, 1fr) 78px 96px 96px'
  const colSpan = compareEnabled ? 6 : 5

  return (
    <ChartCard
      title="Funil de Vendas"
      description={
        rows.length > 0
          ? `${rows.length} etapas desde "${rows[0].stage_nome}" — clique numa etapa pra ver os cards`
          : 'Sem dados no período selecionado'
      }
      colSpan={2}
      isLoading={isLoading}
    >
      {rows.length === 0 && !isLoading && (
        <div className="py-12 px-6 text-center text-slate-400 text-sm">
          Sem dados para os filtros atuais. Troque o período, a Referência (Na Etapa/Criação)
          ou o Status para ver outro recorte.
        </div>
      )}

      {rows.length > 0 && (
        <div className="px-4 pb-4 overflow-x-auto">
          <div
            className="grid gap-x-3 text-xs items-center min-w-[800px]"
            style={{ gridTemplateColumns: gridCols }}
          >
            {/* Cabeçalho */}
            <div className="text-slate-500 font-medium py-2.5">Etapa</div>
            <div className="text-slate-500 font-medium py-2.5">Volume</div>
            <div
              className="text-slate-500 font-medium py-2.5 text-right whitespace-nowrap"
              title="Quanto essa etapa representa do topo do funil selecionado"
            >
              % do topo
            </div>
            <div
              className="text-slate-500 font-medium py-2.5 text-right whitespace-nowrap"
              title="Conversão da etapa imediatamente anterior pra essa"
            >
              Conv. etapa
            </div>
            <div
              className="text-slate-500 font-medium py-2.5 text-right whitespace-nowrap"
              title="Mediana (p50) / percentil 75 (p75) de dias que um card leva passando pela etapa"
            >
              Tempo p50/p75
            </div>
            {compareEnabled && (
              <div
                className="text-slate-500 font-medium py-2.5 text-right whitespace-nowrap"
                title="Variação vs mesma etapa no período anterior"
              >
                vs anterior
              </div>
            )}

            {/* Separador */}
            <div
              className="border-b border-slate-200"
              style={{ gridColumn: `span ${colSpan}` }}
            />

            {/* Linhas */}
            {rows.map(row => {
              const color = getPhaseColor(row.phase_slug)
              const isEmpty = row.value === 0
              return (
                <div
                  key={row.stage_id}
                  onClick={() => onStageDrill(row.stage_id, row.stage_nome)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onStageDrill(row.stage_id, row.stage_nome)
                    }
                  }}
                  className="contents cursor-pointer group"
                >
                  {/* Etapa */}
                  <div className="py-2.5 flex items-center gap-2 group-hover:bg-slate-50/70 -ml-2 pl-2 rounded-l">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className={cn(
                        'text-slate-800 font-medium truncate',
                        row.isRoot && 'font-semibold'
                      )}
                      title={row.stage_nome}
                    >
                      {row.stage_nome}
                    </span>
                    {row.isRoot && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-600 uppercase tracking-wider shrink-0">
                        topo
                      </span>
                    )}
                  </div>

                  {/* Barra */}
                  <div className="py-2.5 group-hover:bg-slate-50/70">
                    <div className="relative h-7 bg-slate-100 rounded-md overflow-hidden">
                      {!isEmpty && (
                        <div
                          className="absolute inset-y-0 left-0 rounded-md transition-all group-hover:brightness-110"
                          style={{
                            width: `${Math.max(row.widthPct, 1)}%`,
                            background: color,
                            minWidth: '40px',
                          }}
                        />
                      )}
                      <div className="absolute inset-0 flex items-center px-3 justify-between gap-3">
                        <span
                          className={cn(
                            'text-xs font-semibold tabular-nums drop-shadow-sm truncate',
                            isEmpty ? 'text-slate-400' : 'text-white'
                          )}
                        >
                          {formatValue(row.value, metric)}
                        </span>
                        {metric !== 'cards' && row.acumulado !== row.value && (
                          <span
                            className={cn(
                              'text-[10px] tabular-nums whitespace-nowrap',
                              isEmpty ? 'text-slate-300' : 'text-white/80'
                            )}
                            title="Acumulado até essa etapa"
                          >
                            Σ {formatCurrency(row.acumulado)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* % do topo */}
                  <div className="py-2.5 text-right text-slate-600 font-medium tabular-nums whitespace-nowrap group-hover:bg-slate-50/70">
                    {row.pctFromRoot.toFixed(1)}%
                  </div>

                  {/* Conversão etapa */}
                  <div className="py-2.5 text-right whitespace-nowrap group-hover:bg-slate-50/70">
                    {row.convFromPrev == null ? (
                      <span className="text-slate-300 text-[11px]">—</span>
                    ) : (
                      <span
                        className={cn(
                          'text-[11px] font-semibold tabular-nums',
                          row.convFromPrev < 50 && 'text-rose-600',
                          row.convFromPrev >= 50 && row.convFromPrev < 100 && 'text-amber-600',
                          row.convFromPrev >= 100 && 'text-emerald-600'
                        )}
                      >
                        {row.convFromPrev.toFixed(1)}%
                      </span>
                    )}
                  </div>

                  {/* p50 / p75 dias */}
                  <div
                    className={cn(
                      'py-2.5 text-right whitespace-nowrap group-hover:bg-slate-50/70 tabular-nums',
                      !compareEnabled && '-mr-2 pr-2 rounded-r'
                    )}
                  >
                    {row.p50 === 0 && row.p75 === 0 ? (
                      <span className="text-slate-300 text-[11px]">—</span>
                    ) : (
                      <span className="text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-700">{row.p50.toFixed(1)}d</span>
                        <span className="text-slate-300 mx-0.5">·</span>
                        <span className="text-slate-500">{row.p75.toFixed(1)}d</span>
                      </span>
                    )}
                  </div>

                  {/* vs anterior */}
                  {compareEnabled && (
                    <div className="py-2.5 text-right whitespace-nowrap group-hover:bg-slate-50/70 -mr-2 pr-2 rounded-r">
                      <DeltaBadge value={row.deltaVsPeriod} title="vs período anterior" />
                    </div>
                  )}

                  {/* Separador entre linhas */}
                  <div
                    className="border-b border-slate-50"
                    style={{ gridColumn: `span ${colSpan}` }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </ChartCard>
  )
}
