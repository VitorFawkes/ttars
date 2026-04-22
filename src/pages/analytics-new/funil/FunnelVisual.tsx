import { useMemo } from 'react'
import ChartCard from '@/components/analytics/ChartCard'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'
import type { FunnelStageData } from '@/hooks/analytics/useFunnelConversion'
import { getPhaseColor, relativeDelta, type FunnelMetric } from './constants'

interface Props {
  isLoading: boolean
  stages: FunnelStageData[]
  previousStages: FunnelStageData[] | null
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
  isRoot: boolean
}

function getValueForMetric(stage: FunnelStageData, metric: FunnelMetric): number {
  if (metric === 'cards') return stage.current_count
  return stage.total_valor || 0
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
    // IMPORTANTE: a ordem de `stages` já vem correta do FunnelView (pelo pipeline_stages
    // canônico). NÃO reordenar aqui.
    const sorted = stages

    const rootValue = getValueForMetric(sorted[0], metric) || 0
    // Baseline da largura: MAX entre os visíveis (evita barras estourando quando
    // etapas downstream têm mais cards que o topo)
    const maxValue = Math.max(...sorted.map(s => getValueForMetric(s, metric)), 1)

    const prevByStage = new Map<string, FunnelStageData>()
    if (previousStages) for (const p of previousStages) prevByStage.set(p.stage_id, p)

    return sorted.map((s, idx) => {
      const value = getValueForMetric(s, metric)
      const prevInFunnel = idx > 0 ? sorted[idx - 1] : null
      const prevValueInFunnel = prevInFunnel ? getValueForMetric(prevInFunnel, metric) : null

      const periodPrev = prevByStage.get(s.stage_id)
      const periodPrevValue = periodPrev ? getValueForMetric(periodPrev, metric) : null

      return {
        stage_id: s.stage_id,
        stage_nome: s.stage_nome,
        phase_slug: s.phase_slug,
        value,
        widthPct: maxValue > 0 ? Math.max(4, (value / maxValue) * 100) : 0,
        pctFromRoot: rootValue > 0 ? (value / rootValue) * 100 : 0,
        convFromPrev:
          prevValueInFunnel != null && prevValueInFunnel > 0
            ? (value / prevValueInFunnel) * 100
            : null,
        deltaVsPeriod: periodPrevValue != null ? relativeDelta(value, periodPrevValue) : null,
        isRoot: idx === 0,
      }
    })
  }, [stages, previousStages, metric])

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
          Sem dados no período. Ajuste filtros ou escolha outra etapa raiz.
        </div>
      )}

      {rows.length > 0 && (
        <div className="px-4 pb-4">
          {/* Grid com 4 colunas (5 com compare):
              Etapa · Barra (flex 1fr) · % topo · Conv etapa · [vs anterior] */}
          <div
            className="grid gap-x-3 text-xs items-center"
            style={{
              gridTemplateColumns: compareEnabled
                ? 'minmax(200px, 240px) minmax(400px, 1fr) 80px 120px 100px'
                : 'minmax(200px, 240px) minmax(400px, 1fr) 80px 120px',
            }}
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
              Conversão etapa
            </div>
            {compareEnabled && (
              <div
                className="text-slate-500 font-medium py-2.5 text-right whitespace-nowrap"
                title="Variação vs mesma etapa no período anterior"
              >
                vs anterior
              </div>
            )}

            {/* Separador full-width */}
            <div
              className="border-b border-slate-200"
              style={{ gridColumn: `span ${compareEnabled ? 5 : 4}` }}
            />

            {/* Linhas */}
            {rows.map(row => {
              const color = getPhaseColor(row.phase_slug)
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
                      <div
                        className="absolute inset-y-0 left-0 rounded-md transition-all group-hover:brightness-110"
                        style={{
                          width: `${row.widthPct}%`,
                          background: color,
                          minWidth: '44px',
                        }}
                      />
                      <div className="absolute inset-0 flex items-center px-3">
                        <span className="text-white text-xs font-semibold tabular-nums drop-shadow-sm">
                          {formatValue(row.value, metric)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* % do topo */}
                  <div className="py-2.5 text-right text-slate-600 font-medium tabular-nums whitespace-nowrap group-hover:bg-slate-50/70">
                    {row.pctFromRoot.toFixed(1)}%
                  </div>

                  {/* Conversão etapa */}
                  <div
                    className={cn(
                      'py-2.5 text-right whitespace-nowrap group-hover:bg-slate-50/70',
                      !compareEnabled && '-mr-2 pr-2 rounded-r'
                    )}
                  >
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

                  {/* vs anterior */}
                  {compareEnabled && (
                    <div className="py-2.5 text-right whitespace-nowrap group-hover:bg-slate-50/70 -mr-2 pr-2 rounded-r">
                      <DeltaBadge value={row.deltaVsPeriod} title="vs período anterior" />
                    </div>
                  )}

                  {/* Separador entre linhas */}
                  <div
                    className="border-b border-slate-50"
                    style={{ gridColumn: `span ${compareEnabled ? 5 : 4}` }}
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
