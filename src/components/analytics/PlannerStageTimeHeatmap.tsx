import { useMemo, useState } from 'react'
import { GitBranch, Users as UsersIcon, Calendar, Loader2, ChevronDown } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { usePlannerStageXOwner, type StageXOwnerRow } from '@/hooks/analytics/usePlannerStageXOwner'
import { useFilterProfilesWithRole } from '@/hooks/analytics/useFilterOptions'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useDrillDownStore, type DrillDownCard } from '@/hooks/analytics/useAnalyticsDrillDown'
import { supabase } from '@/lib/supabase'
import { getRankTier, rankBadgeClass, rankTierLabel } from '@/utils/rankColor'
import { cn } from '@/lib/utils'

type Metric = 'medio' | 'pior' | 'atuais'
type WindowPreset = 'this_month' | 'last_30d' | 'last_90d' | 'this_year' | 'custom'

// COLORS placeholder removed — paleta vem do hook quando precisar

function windowDates(preset: WindowPreset, customStart?: string, customEnd?: string) {
  const now = new Date()
  const endStr = now.toISOString()
  switch (preset) {
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: endStr }
    case 'last_30d':
      return { start: subDays(now, 30).toISOString(), end: endStr }
    case 'last_90d':
      return { start: subDays(now, 90).toISOString(), end: endStr }
    case 'this_year':
      return { start: new Date(now.getFullYear(), 0, 1).toISOString(), end: endStr }
    case 'custom':
      return {
        start: customStart ? new Date(customStart + 'T00:00:00').toISOString() : subDays(now, 90).toISOString(),
        end: customEnd ? new Date(customEnd + 'T23:59:59').toISOString() : endStr,
      }
  }
}

function windowLabel(p: WindowPreset): string {
  switch (p) {
    case 'this_month': return 'Este mês'
    case 'last_30d': return 'Últimos 30 dias'
    case 'last_90d': return 'Últimos 90 dias'
    case 'this_year': return 'Este ano'
    case 'custom': return 'Datas específicas'
  }
}

function valueFor(row: StageXOwnerRow, metric: Metric): number {
  switch (metric) {
    case 'medio': return Number(row.tempo_medio_dias)
    case 'pior': return Number(row.tempo_pior_dias)
    case 'atuais': return row.cards_atuais
  }
}

export default function PlannerStageTimeHeatmap() {
  const drillDown = useDrillDownStore()
  const profiles = useFilterProfilesWithRole()
  const meta = useCurrentProductMeta()
  const stages = usePipelineStages(meta.pipelineId)

  const allPlanners = useMemo(() => (profiles.data ?? []).filter(p => p.role === 'vendas'), [profiles.data])
  const allStages = useMemo(() => (stages.data ?? []).filter((s) => (s as { ativo?: boolean }).ativo !== false), [stages.data])

  const [windowPreset, setWindowPreset] = useState<WindowPreset>('last_90d')
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 90), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [selectedOwners, setSelectedOwners] = useState<string[]>([])
  const [metric, setMetric] = useState<Metric>('medio')

  // CRÍTICO: memoizar pra não criar new Date() a cada render (causa loop infinito de queries)
  const { start, end } = useMemo(
    () => windowDates(windowPreset, customStart, customEnd),
    [windowPreset, customStart, customEnd],
  )

  const { data, isLoading } = usePlannerStageXOwner({
    dateStart: start,
    dateEnd: end,
    stageIds: selectedStages,
    ownerIds: selectedOwners,
  })

  // Pivot: row = stage, col = owner
  const { stagesInGrid, ownersInGrid, valueMap, sampleByStage } = useMemo(() => {
    if (!data || data.length === 0) {
      return { stagesInGrid: [], ownersInGrid: [], valueMap: new Map<string, StageXOwnerRow>(), sampleByStage: new Map<string, number[]>(), sampleByOwner: new Map<string, number[]>() }
    }
    const stageMap = new Map<string, { id: string; nome: string; phase_slug: string; phase_order: number; stage_ordem: number }>()
    const ownerMap = new Map<string, { id: string; nome: string }>()
    const valueMap = new Map<string, StageXOwnerRow>()  // key = stage_id|owner_id

    for (const row of data) {
      stageMap.set(row.stage_id, {
        id: row.stage_id, nome: row.stage_nome, phase_slug: row.phase_slug,
        phase_order: row.phase_order, stage_ordem: row.stage_ordem,
      })
      ownerMap.set(row.planner_id, { id: row.planner_id, nome: row.planner_nome })
      valueMap.set(`${row.stage_id}|${row.planner_id}`, row)
    }

    const stagesInGrid = Array.from(stageMap.values()).sort((a, b) =>
      (a.phase_order ?? 999) - (b.phase_order ?? 999) || a.stage_ordem - b.stage_ordem
    )
    const ownersInGrid = Array.from(ownerMap.values()).sort((a, b) => a.nome.localeCompare(b.nome))

    // Samples para rank coloring: por LINHA (etapa) — comparar Planners na mesma etapa
    const sampleByStage = new Map<string, number[]>()
    const sampleByOwner = new Map<string, number[]>()
    for (const s of stagesInGrid) {
      const arr: number[] = []
      for (const o of ownersInGrid) {
        const v = valueMap.get(`${s.id}|${o.id}`)
        if (v) arr.push(valueFor(v, metric))
      }
      sampleByStage.set(s.id, arr)
    }
    for (const o of ownersInGrid) {
      const arr: number[] = []
      for (const s of stagesInGrid) {
        const v = valueMap.get(`${s.id}|${o.id}`)
        if (v) arr.push(valueFor(v, metric))
      }
      sampleByOwner.set(o.id, arr)
    }

    return { stagesInGrid, ownersInGrid, valueMap, sampleByStage, sampleByOwner }
  }, [data, metric])

  // Quando 1 etapa selecionada, mostra série temporal por planner (mock: pra real precisaria RPC por mês)
  // V1: só mostra o heatmap. Série temporal vira follow-up.

  const openCell = (stageId: string, stageNome: string, ownerId: string, ownerNome: string) => {
    // "Cards agora" (atuais): cards abertos NESSA etapa agora, do vendas_owner — current_stage casa.
    if (metric === 'atuais') {
      drillDown.open({
        label: `${ownerNome} · ${stageNome}`,
        contextIcon: '📊',
        drillSource: 'current_stage',
        drillStageId: stageId,
        drillOwnerId: ownerId,
        drillPhase: 'planner', // atribui por vendas_owner, igual à métrica
        summary: 'cards parados nessa etapa agora',
      })
      return
    }
    // Tempo médio / pior caso: o número é "cards que PASSARAM pela etapa no período".
    // Busca os cards EXATOS dessa população (RPC dedicada) e mostra TODOS no drawer (paginado).
    drillDown.open({
      label: `${ownerNome} · ${stageNome}`,
      contextIcon: '⏱️',
      presetKey: `stagecell-${stageId}-${ownerId}-${start}-${end}`,
      summary: `cards que passaram pela etapa · ${windowLabel(windowPreset)}`,
      presetLoader: async (): Promise<DrillDownCard[]> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.rpc as any)('analytics_planner_stage_x_owner_cards', {
          p_stage_id: stageId, p_owner_id: ownerId, p_date_start: start, p_date_end: end, p_product: meta.product ?? null,
        })
        if (error) throw error
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((data as any[]) ?? []).map((r): DrillDownCard => {
          const dias = r.dias_na_etapa != null ? Math.round(Number(r.dias_na_etapa)) : null
          return {
            id: r.id, titulo: r.titulo, produto: r.produto, status_comercial: r.status_comercial,
            etapa_nome: r.etapa_nome ?? '—', fase: r.fase ?? '', dono_atual_nome: r.dono_atual_nome ?? ownerNome,
            valor_display: Number(r.valor_display) || 0, receita: Number(r.receita) || 0,
            created_at: r.created_at, data_fechamento: r.data_fechamento,
            pessoa_nome: r.pessoa_nome ?? null, pessoa_telefone: r.pessoa_telefone ?? null,
            total_count: 0, stage_entered_at: r.stage_entered_at, data_prevista: null,
            extra_label: dias != null ? `${dias} ${dias === 1 ? 'dia' : 'dias'} nessa etapa` : null,
          }
        })
      },
    })
  }

  const openColumn = (ownerId: string, ownerNome: string) => {
    drillDown.open({
      label: `Cards abertos de ${ownerNome}`,
      drillSource: 'current_stage',
      drillOwnerId: ownerId,
    })
  }

  // Direção: para tempo (medio/pior), menos é melhor. Para cards_atuais, neutro (não tem "bom" / "ruim" universal — mais cards pode ser sobrecarga ou volume alto)
  const direction = metric === 'atuais' ? 'higher_is_better' : 'lower_is_better'

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Tempo em cada etapa por Planner</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {metric === 'medio' && 'Em média, quantos dias um card leva pra passar pela etapa, por pessoa.'}
            {metric === 'pior' && 'Pior caso: 9 em cada 10 cards passam em até X dias.'}
            {metric === 'atuais' && 'Quantos cards estão NESSA etapa AGORA, por pessoa.'}
          </p>
        </div>
        <div className="flex items-center gap-0.5 bg-slate-50 rounded-md p-0.5">
          {([
            ['medio', 'Tempo médio'],
            ['pior', 'Quem demora mais'],
            ['atuais', 'Cards agora'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setMetric(v)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                metric === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-100">
        {/* Janela temporal (só pra medio/pior — atuais é snapshot) */}
        {metric !== 'atuais' && (
          <details className="relative">
            <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-900">{windowLabel(windowPreset)}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </summary>
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
              {(['this_month','last_30d','last_90d','this_year'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setWindowPreset(p)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                    windowPreset === p && 'bg-indigo-50 text-indigo-700 font-medium',
                  )}
                >
                  {windowLabel(p)}
                </button>
              ))}
              <div className="border-t border-slate-100 mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => setWindowPreset('custom')}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                    windowPreset === 'custom' && 'bg-indigo-50 text-indigo-700 font-medium',
                  )}
                >
                  Datas específicas
                </button>
                {windowPreset === 'custom' && (
                  <div className="space-y-1 mt-1 px-1">
                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full px-2 py-1 text-xs border border-slate-200 rounded" />
                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full px-2 py-1 text-xs border border-slate-200 rounded" />
                  </div>
                )}
              </div>
            </div>
          </details>
        )}

        {/* Etapas */}
        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50">
            <GitBranch className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900">
              {selectedStages.length === 0 ? 'Todas as etapas' : `${selectedStages.length} etapa${selectedStages.length > 1 ? 's' : ''}`}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </summary>
          <div className="absolute top-full left-0 mt-1 w-72 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            <button
              type="button"
              onClick={() => setSelectedStages([])}
              className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                selectedStages.length === 0 && 'bg-indigo-50 text-indigo-700 font-medium')}
            >
              Todas
            </button>
            {allStages.map(s => {
              const selected = selectedStages.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (selected) setSelectedStages(selectedStages.filter(x => x !== s.id))
                    else setSelectedStages([...selectedStages, s.id])
                  }}
                  className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between',
                    selected && 'bg-indigo-50 text-indigo-700')}
                >
                  <span className="truncate">{s.nome}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
        </details>

        {/* Planners */}
        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50">
            <UsersIcon className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900">
              {selectedOwners.length === 0 ? 'Todos os Planners' : `${selectedOwners.length} Planner${selectedOwners.length > 1 ? 's' : ''}`}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </summary>
          <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            <button
              type="button"
              onClick={() => setSelectedOwners([])}
              className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                selectedOwners.length === 0 && 'bg-indigo-50 text-indigo-700 font-medium')}
            >
              Todos
            </button>
            {allPlanners.map(p => {
              const selected = selectedOwners.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (selected) setSelectedOwners(selectedOwners.filter(x => x !== p.id))
                    else setSelectedOwners([...selectedOwners, p.id])
                  }}
                  className={cn('w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between',
                    selected && 'bg-indigo-50 text-indigo-700')}
                >
                  <span className="truncate">{p.nome}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
        </details>
      </div>

      {/* Heatmap */}
      {isLoading ? (
        <div className="h-72 flex items-center justify-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : stagesInGrid.length === 0 || ownersInGrid.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-400">
          Sem dados de movimentação no período/filtros.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left py-2 pr-3 font-medium text-slate-500 sticky left-0 bg-white z-10">Etapa</th>
                {ownersInGrid.map(o => (
                  <th key={o.id} className="text-center py-2 px-1 font-medium text-slate-500 min-w-[80px]">
                    <button
                      type="button"
                      onClick={() => openColumn(o.id, o.nome)}
                      className="hover:text-indigo-700 hover:underline truncate max-w-[100px] inline-block"
                      title={`Ver cards abertos de ${o.nome}`}
                    >
                      {o.nome.split(' ')[0]}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stagesInGrid.map(s => {
                const sample = sampleByStage.get(s.id) ?? []
                return (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 text-slate-700 font-medium sticky left-0 bg-white z-10">
                      <span className="text-[10px] uppercase text-slate-400 mr-1.5">{s.phase_slug}</span>
                      {s.nome}
                    </td>
                    {ownersInGrid.map(o => {
                      const row = valueMap.get(`${s.id}|${o.id}`)
                      if (!row) {
                        return <td key={o.id} className="py-1.5 px-1 text-center text-slate-200">—</td>
                      }
                      const v = valueFor(row, metric)
                      const tier = getRankTier(v, sample, direction)
                      const display = metric === 'atuais' ? `${v}` : `${v.toFixed(0)}d`
                      const tooltip = metric === 'atuais'
                        ? `${v} cards de ${o.nome} parados em "${s.nome}" agora`
                        : `${o.nome} em "${s.nome}": ${display} (${row.cards_passaram} cards passaram). ${rankTierLabel(tier)}`
                      return (
                        <td key={o.id} className="py-1 px-1 text-center">
                          <button
                            type="button"
                            onClick={() => openCell(s.id, s.nome, o.id, o.nome)}
                            className={cn(
                              'inline-flex items-center justify-center min-w-[50px] px-2 py-1 rounded-md text-xs font-semibold tabular-nums hover:ring-2 hover:ring-indigo-300',
                              rankBadgeClass(tier),
                            )}
                            title={tooltip}
                          >
                            {display}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] text-slate-400 pt-2">
        Cor verde = melhor do grupo nessa etapa, vermelho = pior. Clique numa célula pra ver os cards. Clique no nome do Planner pra abrir cards abertos dele.
      </div>
    </div>
  )
}
