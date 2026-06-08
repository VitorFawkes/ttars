import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Trophy, ListX, Clock, Loader2, Layers } from 'lucide-react'
import PlannerProfileDrawer from '@/components/analytics/PlannerProfileDrawer'
import PlannerForecastChart from '@/components/analytics/PlannerForecastChart'
import PlannerStageTimeHeatmap from '@/components/analytics/PlannerStageTimeHeatmap'
import KpiCard from '@/components/analytics/KpiCard'
import { useFunnelConversion, useLossReasons } from '@/hooks/analytics/useFunnelConversion'
import { useFunnelVelocity } from '@/hooks/analytics/useFunnelVelocity'
import { useTeamLeaderboard } from '@/hooks/analytics/useTeamLeaderboard'
import { useTeamTicketVariation } from '@/hooks/analytics/useTeamTicketVariation'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useResumoOverview, useResumoOverviewPrevious } from '@/hooks/analytics/useResumoOverview'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useFilterProfilesWithRole } from '@/hooks/analytics/useFilterOptions'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { getRankTier, rankBadgeClass, rankTextClass, rankTierLabel } from '@/utils/rankColor'
import WidgetCard from './WidgetCard'
import SimpleFilterBar from './SimpleFilterBar'
import { FILTER_CONTRACTS } from '@/hooks/analytics/filterContracts'
import HBarChart, { type HBarDatum } from './charts/HBarChart'
import { cn } from '@/lib/utils'

const ORIGEM_LABELS: Record<string, string> = {
  manual: 'Planner direto',
  whatsapp: 'WhatsApp (Julia)',
  active_campaign: 'Active Campaign',
  mkt: 'Marketing',
  indicacao: 'Indicação',
  carteira_propria: 'Carteira própria',
  carteira_wg: 'Carteira WG',
  sorrento: 'Sorrento',
  weddings: 'Weddings (cruzado)',
  sem_origem: 'Sem origem',
}

interface PlannerByOrigemRow {
  planner_id: string
  planner_nome: string
  origem: string
  leads: number
  ganhos: number
  conversao_pct: number
  receita_total: number
}

function usePlannerByOrigem() {
  const { dateRange, product, ownerIds } = useAnalyticsFilters()
  return useQuery({
    queryKey: ['analytics', 'planner_by_origem', dateRange.start, dateRange.end, product, ownerIds],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('analytics_planner_by_origem', {
        p_date_start: dateRange.start,
        p_date_end: dateRange.end,
        p_product: product,
        p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
      })
      if (error) throw error
      return (data as PlannerByOrigemRow[] | null) ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

function pct(v: number): string {
  return `${v.toFixed(0)}%`
}

function ConversionBadge({ rate, sample }: { rate: number; sample: readonly number[] }) {
  const tier = getRankTier(rate, sample, 'higher_is_better')
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums',
        rankBadgeClass(tier),
      )}
      title={rankTierLabel(tier)}
    >
      {pct(rate)}
    </span>
  )
}

export default function PlannerView() {
  const funnel = useFunnelConversion()
  const velocity = useFunnelVelocity()
  const lossReasons = useLossReasons()
  const leaderboard = useTeamLeaderboard()
  const ticketVar = useTeamTicketVariation()
  const resumo = useResumoOverview()
  const resumoPrev = useResumoOverviewPrevious()
  const plannerByOrigem = usePlannerByOrigem()
  const profilesByRole = useFilterProfilesWithRole()
  const drillDown = useDrillDownStore()
  const { origins, setOrigins } = useAnalyticsFilters()

  // IDs de quem é Planner de verdade (role='vendas') no workspace
  const plannerIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of profilesByRole.data ?? []) {
      if (p.role === 'vendas') set.add(p.id)
    }
    return set
  }, [profilesByRole.data])

  const plannerStages = useMemo(() => {
    return (funnel.data ?? []).filter(s => s.phase_slug === 'planner').sort((a, b) => a.ordem - b.ordem)
  }, [funnel.data])
  const totalPlanner = plannerStages.reduce((sum, s) => sum + s.current_count, 0)

  const plannerLeaderboard = useMemo(() => {
    return (leaderboard.data ?? []).filter(row => plannerIds.has(row.user_id))
  }, [leaderboard.data, plannerIds])

  const plannerVelocity = useMemo(() => {
    return (velocity.data ?? [])
      .filter(v => v.phase_slug === 'planner')
      .sort((a, b) => a.ordem - b.ordem)
  }, [velocity.data])

  // Gráfico de gestor: tempo típico (mediana) por etapa — onde os cards empacam
  const velocityChart = useMemo<HBarDatum[]>(
    () =>
      plannerVelocity
        .filter(v => v.mediana_dias > 0)
        .map(v => ({ key: v.stage_id, label: v.stage_nome, value: Math.round(v.mediana_dias) })),
    [plannerVelocity],
  )

  // Filtra ticket variation pra mostrar só planners
  const plannerTicketVar = useMemo(() => {
    return (ticketVar.data ?? []).filter(row => plannerIds.has(row.user_id))
  }, [ticketVar.data, plannerIds])

  // KPIs hero — agregados do leaderboard filtrado
  const ganhosTotal = plannerLeaderboard.reduce((s, r) => s + r.cards_ganhos, 0)
  const perdidosTotal = plannerLeaderboard.reduce((s, r) => s + r.cards_perdidos, 0)
  const receitaTotal = plannerLeaderboard.reduce((s, r) => s + r.receita_total, 0)

  const prevGanhos = resumoPrev.data?.empresa.kpis.ganhos
  const prevFaturamento = resumoPrev.data?.empresa.kpis.faturamento

  // Samples para coloração relativa (top/meio/bottom 25% no grupo visível)
  const plannerWinRateSample = useMemo(
    () => plannerLeaderboard.map(r => r.win_rate),
    [plannerLeaderboard],
  )
  const origemConvSample = useMemo(
    () =>
      (resumo.data?.por_origem ?? [])
        .filter(r => r.leads > 0)
        .map(r => Math.round((r.ganhos / r.leads) * 100)),
    [resumo.data?.por_origem],
  )
  const cellConvSample = useMemo(
    () =>
      (plannerByOrigem.data ?? [])
        .filter(r => plannerIds.has(r.planner_id) && r.leads > 0)
        .map(r => r.conversao_pct ?? 0),
    [plannerByOrigem.data, plannerIds],
  )

  // Pivot Origem × Planner — só planners de verdade
  const plannerOrigemPivot = useMemo(() => {
    const rows = (plannerByOrigem.data ?? []).filter(r => plannerIds.has(r.planner_id))
    const origensSet = new Set<string>()
    const byPlanner = new Map<string, { nome: string; origens: Record<string, PlannerByOrigemRow>; totalLeads: number; totalGanhos: number }>()
    for (const r of rows) {
      origensSet.add(r.origem)
      const entry = byPlanner.get(r.planner_id) ?? { nome: r.planner_nome, origens: {}, totalLeads: 0, totalGanhos: 0 }
      entry.origens[r.origem] = r
      entry.totalLeads += r.leads
      entry.totalGanhos += r.ganhos
      byPlanner.set(r.planner_id, entry)
    }
    const origensList = Array.from(origensSet).sort((a, b) => {
      const aTotal = rows.filter(r => r.origem === a).reduce((s, r) => s + r.leads, 0)
      const bTotal = rows.filter(r => r.origem === b).reduce((s, r) => s + r.leads, 0)
      return bTotal - aTotal
    })
    const plannersList = Array.from(byPlanner.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.totalLeads - a.totalLeads)
    return { origensList, plannersList }
  }, [plannerByOrigem.data, plannerIds])

  const openCardsInStage = (stageId: string, stageName: string) => {
    drillDown.open({
      label: `Cards na etapa: ${stageName}`,
      drillStageId: stageId,
      drillSource: 'current_stage',
    })
  }

  const [profilePlanner, setProfilePlanner] = useState<{ id: string; nome: string } | null>(null)

  const openProfilePlanner = (ownerId: string, ownerName: string) => {
    setProfilePlanner({ id: ownerId, nome: ownerName })
  }

  // Mantém função antiga (drill-down de cards puros) caso algum widget queira só lista
  const openCardsByOwner = (ownerId: string, ownerName: string) => {
    drillDown.open({
      label: `Cards de ${ownerName}`,
      drillSource: 'current_stage',
      drillOwnerId: ownerId,
    })
  }

  const openLostCards = (reason?: string) => {
    drillDown.open({
      label: reason ? `Perdidos: ${reason}` : 'Cards perdidos',
      drillSource: 'lost_deals',
      drillLossReason: reason,
      drillStatus: 'perdido',
    })
  }

  const openClosedDeals = () => {
    drillDown.open({
      label: 'Ganhos no período',
      drillSource: 'closed_deals',
      drillPhase: 'planner',
    })
  }

  const openLeadsByOrigin = (origem: string) => {
    setOrigins([origem])
  }

  const openPlannerOrigem = (ownerId: string, ownerName: string, origem: string) => {
    setOrigins([origem])
    drillDown.open({
      label: `${ownerName} — ${ORIGEM_LABELS[origem] ?? origem}`,
      drillSource: 'current_stage',
      drillOwnerId: ownerId,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Planner (Travel Planner / Closer)</h1>
        <p className="text-sm text-slate-500 mt-1">
          O que está acontecendo com quem fecha a venda. Clique em qualquer número, barra ou linha pra ver os cards.
        </p>
      </header>

      <SimpleFilterBar contract={FILTER_CONTRACTS.planner} roleFilter="vendas" myButtonLabel="Meus cards" />

      {origins.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-amber-800">
            Filtrando por origem: <strong>{origins.map(o => ORIGEM_LABELS[o] ?? o).join(', ')}</strong>
          </span>
          <button onClick={() => setOrigins([])} className="text-xs text-amber-700 underline">
            limpar
          </button>
        </div>
      )}

      {/* KPIs hero */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Cards na mesa do Planner"
          value={totalPlanner}
          icon={Briefcase}
          color="text-blue-600"
          bgColor="bg-blue-50"
          isLoading={funnel.isLoading}
          onClick={plannerStages[0] ? () => openCardsInStage(plannerStages[0].stage_id, 'Carteira Planner') : undefined}
          clickHint={plannerStages[0] ? 'Ver cards →' : undefined}
        />
        <KpiCard
          title="Ganhos no período"
          value={ganhosTotal}
          icon={Trophy}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={leaderboard.isLoading}
          delta={prevGanhos !== undefined ? { current: ganhosTotal, previous: prevGanhos } : undefined}
          onClick={openClosedDeals}
          clickHint="Ver ganhos →"
        />
        <KpiCard
          title="Perdidos no período"
          value={perdidosTotal}
          icon={ListX}
          color={perdidosTotal > 0 ? 'text-rose-600' : 'text-slate-400'}
          bgColor={perdidosTotal > 0 ? 'bg-rose-50' : 'bg-slate-50'}
          isLoading={leaderboard.isLoading}
          onClick={() => openLostCards()}
          clickHint="Ver perdidos →"
        />
        <KpiCard
          title="Receita total"
          value={formatCurrency(receitaTotal)}
          icon={Trophy}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={leaderboard.isLoading}
          delta={prevFaturamento !== undefined ? { current: receitaTotal, previous: prevFaturamento } : undefined}
          onClick={openClosedDeals}
          clickHint="Ver ganhos →"
        />
      </div>

      {/* Carteira por etapa — barras clicáveis */}
      <WidgetCard
        title="Carteira por etapa do Planner"
        subtitle="Quantos cards estão em cada etapa nesse momento. Clique numa barra pra ver os cards."
      >
        {funnel.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : plannerStages.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem etapas Planner mapeadas no funil
          </div>
        ) : (
          <div className="space-y-2">
            {plannerStages.map(stage => {
              const share = totalPlanner > 0 ? (stage.current_count / totalPlanner) * 100 : 0
              return (
                <button
                  key={stage.stage_id}
                  onClick={() => openCardsInStage(stage.stage_id, stage.stage_nome)}
                  className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-indigo-50 group transition-colors"
                >
                  <span className="text-sm text-slate-700 group-hover:text-indigo-700 w-64 truncate text-left">{stage.stage_nome}</span>
                  <div className="flex-1 bg-slate-100 rounded h-6 overflow-hidden">
                    <div
                      className="bg-indigo-500 group-hover:bg-indigo-600 h-full transition-all"
                      style={{ width: `${Math.max(2, share)}%` }}
                    />
                  </div>
                  <span className="w-12 text-sm text-slate-700 tabular-nums text-right">
                    {stage.current_count}
                  </span>
                  <span className="w-14 text-right text-xs text-slate-500 tabular-nums">
                    {share.toFixed(0)}%
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </WidgetCard>

      {/* Leaderboard Planner */}
      <WidgetCard
        title="Ranking dos Planners"
        subtitle={`Apenas pessoas com função Vendas/Planner (${plannerIds.size} no workspace). Clique numa pessoa pra ver os cards.`}
      >
        {leaderboard.isLoading || profilesByRole.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : plannerLeaderboard.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400 flex-col gap-1">
            <p>Nenhum Planner atuou no período</p>
            {plannerIds.size === 0 && (
              <p className="text-xs text-slate-300">Nenhuma pessoa com função Vendas/Planner cadastrada</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">#</th>
                  <th className="text-left py-2 font-medium">Pessoa</th>
                  <th className="text-right py-2 font-medium">Envolvidos</th>
                  <th className="text-right py-2 font-medium">Ganhos</th>
                  <th className="text-right py-2 font-medium">Perdidos</th>
                  <th className="text-right py-2 font-medium">% Sucesso</th>
                  <th className="text-right py-2 font-medium">Receita</th>
                  <th className="text-right py-2 font-medium">Ticket médio</th>
                  <th className="text-right py-2 font-medium">Abertos</th>
                  <th className="text-right py-2 font-medium">Tarefas vencidas</th>
                </tr>
              </thead>
              <tbody>
                {plannerLeaderboard.map((row, idx) => (
                  <tr
                    key={row.user_id}
                    className="border-b border-slate-50 hover:bg-indigo-50 cursor-pointer"
                    onClick={() => openProfilePlanner(row.user_id, row.user_nome)}
                    title="Abrir perfil completo do Planner"
                  >
                    <td className="py-2.5 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="py-2.5 text-slate-900 font-medium">
                      <span className="hover:text-indigo-700 hover:underline">{row.user_nome}</span>
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_envolvidos}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_ganhos}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={cn(row.cards_perdidos > 0 ? 'text-rose-700' : 'text-slate-400')}>
                        {row.cards_perdidos}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <ConversionBadge rate={row.win_rate} sample={plannerWinRateSample} />
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {formatCurrency(row.receita_total)}
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {formatCurrency(row.ticket_medio)}
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_abertos}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-md font-semibold',
                          row.tarefas_vencidas === 0
                            ? 'text-slate-400'
                            : row.tarefas_vencidas <= 3
                              ? 'text-amber-700 bg-amber-50'
                              : 'text-rose-700 bg-rose-50'
                        )}
                      >
                        {row.tarefas_vencidas}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Previsão de fechamento (interativo) — Sprint 5 */}
      <PlannerForecastChart />

      {/* Tempo em cada etapa por Planner (heatmap interativo) — Sprint 5 */}
      <PlannerStageTimeHeatmap />

      {/* Tempo nas etapas */}
      <WidgetCard
        title="Quanto tempo cada etapa leva"
        subtitle="Em quanto tempo metade dos cards passa por cada etapa, e quanto leva quem mais demora. Clique pra ver cards atuais na etapa."
        action={<Clock className="w-4 h-4 text-slate-300" />}
      >
        {velocity.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : plannerVelocity.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem dados de tempo nas etapas
          </div>
        ) : (
          <div className="space-y-4">
            {velocityChart.length > 0 && (
              <HBarChart data={velocityChart} format={(v) => `${v}d`} maxLabel={28} color="#f59e0b" />
            )}
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Etapa</th>
                  <th className="text-right py-2 font-medium">Cards passados</th>
                  <th className="text-right py-2 font-medium">Tempo típico</th>
                  <th className="text-right py-2 font-medium">Quem mais demora</th>
                </tr>
              </thead>
              <tbody>
                {plannerVelocity.map(row => (
                  <tr
                    key={row.stage_id}
                    className="border-b border-slate-50 hover:bg-indigo-50 cursor-pointer"
                    onClick={() => openCardsInStage(row.stage_id, row.stage_nome)}
                  >
                    <td className="py-2.5 text-slate-900 font-medium">
                      <span className="hover:text-indigo-700 hover:underline">{row.stage_nome}</span>
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_passaram}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {row.mediana_dias > 0 ? `${row.mediana_dias.toFixed(0)}d` : '—'}
                    </td>
                    <td className="py-2.5 text-right text-amber-700 tabular-nums font-semibold">
                      {row.p90_dias > 0 ? `${row.p90_dias.toFixed(0)}d` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </WidgetCard>

      {/* Variação de ticket */}
      <WidgetCard
        title="Variação de ticket por Planner"
        subtitle="Quem tem ticket consistente vs quem oscila muito. Clique numa linha pra ver as vendas dele."
      >
        {ticketVar.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : plannerTicketVar.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Nenhuma venda no período pra calcular variação
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Pessoa</th>
                  <th className="text-right py-2 font-medium">Vendas</th>
                  <th className="text-right py-2 font-medium">Mais barata</th>
                  <th className="text-right py-2 font-medium">Ticket médio</th>
                  <th className="text-right py-2 font-medium">Mais cara</th>
                  <th className="text-right py-2 font-medium">Receita total</th>
                </tr>
              </thead>
              <tbody>
                {plannerTicketVar.map(row => {
                  const spread = row.ticket_max - row.ticket_min
                  const muitoVariavel = row.cards_ganhos >= 3 && spread > row.ticket_medio * 2
                  return (
                    <tr
                      key={row.user_id}
                      className="border-b border-slate-50 hover:bg-indigo-50 cursor-pointer"
                      onClick={() => openCardsByOwner(row.user_id, row.user_nome)}
                    >
                      <td className="py-2.5 text-slate-900 font-medium">
                        <span className="hover:text-indigo-700 hover:underline">{row.user_nome}</span>
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_ganhos}</td>
                      <td className="py-2.5 text-right text-slate-600 tabular-nums">
                        {formatCurrency(row.ticket_min)}
                      </td>
                      <td className="py-2.5 text-right text-slate-900 tabular-nums font-medium">
                        {formatCurrency(row.ticket_medio)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span className={cn(muitoVariavel ? 'text-amber-700 font-semibold' : 'text-slate-600')}>
                          {formatCurrency(row.ticket_max)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">
                        {formatCurrency(row.receita_total)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Motivos de perda */}
      <WidgetCard
        title="Por que estamos perdendo"
        subtitle="Motivos mais frequentes. Clique pra ver os cards perdidos por aquele motivo."
      >
        {lossReasons.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !lossReasons.data || lossReasons.data.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem perdas registradas no período
          </div>
        ) : (
          <div className="space-y-2">
            {lossReasons.data.map(reason => (
              <button
                key={reason.motivo}
                onClick={() => openLostCards(reason.motivo)}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-rose-50 transition-colors group"
              >
                <span className="text-sm text-slate-700 group-hover:text-rose-700 w-72 truncate text-left" title={reason.motivo}>
                  {reason.motivo || 'Sem motivo informado'}
                </span>
                <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
                  <div
                    className="bg-rose-400 group-hover:bg-rose-500 h-full"
                    style={{ width: `${Math.max(2, reason.percentage)}%` }}
                  />
                </div>
                <span className="w-12 text-sm text-slate-700 tabular-nums text-right">{reason.count}</span>
                <span className="w-12 text-sm text-rose-700 tabular-nums text-right">
                  {reason.percentage.toFixed(0)}%
                </span>
              </button>
            ))}
          </div>
        )}
      </WidgetCard>

      {/* Origem × Planner */}
      <WidgetCard
        title="Origem dos leads por Planner"
        subtitle="Se diferença de conversão é skill ou mix de canal. Clique numa célula pra ver os cards do cruzamento."
        action={<Layers className="w-4 h-4 text-slate-300" />}
      >
        {plannerByOrigem.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : plannerOrigemPivot.plannersList.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Nenhum lead com Planner atribuído no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Planner</th>
                  <th className="text-right py-2 font-medium">Total</th>
                  {plannerOrigemPivot.origensList.map(o => (
                    <th key={o} className="text-right py-2 font-medium" title={o}>
                      {ORIGEM_LABELS[o] ?? o}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plannerOrigemPivot.plannersList.map(p => {
                  const totalConv = p.totalLeads > 0 ? (p.totalGanhos / p.totalLeads) * 100 : 0
                  return (
                    <tr key={p.id} className="border-b border-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium">
                        <button
                          onClick={() => openCardsByOwner(p.id, p.nome)}
                          className="hover:text-indigo-700 hover:underline"
                        >
                          {p.nome}
                        </button>
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">
                        {p.totalGanhos}/{p.totalLeads}
                        <span className="ml-1 text-xs text-slate-400">({totalConv.toFixed(0)}%)</span>
                      </td>
                      {plannerOrigemPivot.origensList.map(o => {
                        const cell = p.origens[o]
                        if (!cell || cell.leads === 0) {
                          return <td key={o} className="py-2.5 text-right text-slate-300">—</td>
                        }
                        return (
                          <td key={o} className="py-2.5 text-right tabular-nums">
                            <button
                              onClick={() => openPlannerOrigem(p.id, p.nome, o)}
                              className="hover:bg-indigo-50 rounded px-1 py-0.5"
                              title="Ver cards desse cruzamento"
                            >
                              <span className="text-slate-700">{cell.ganhos}/{cell.leads}</span>
                              <span
                                className={cn(
                                  'ml-1 text-xs',
                                  rankTextClass(getRankTier(cell.conversao_pct ?? 0, cellConvSample, 'higher_is_better')),
                                )}
                                title={rankTierLabel(getRankTier(cell.conversao_pct ?? 0, cellConvSample, 'higher_is_better'))}
                              >
                                ({cell.conversao_pct?.toFixed(0) ?? 0}%)
                              </span>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-3">
              Formato: <span className="font-medium">ganhos/leads (% sucesso)</span>. Clique no nome pra ver tudo dele, ou numa célula pra ver o cruzamento.
            </p>
          </div>
        )}
      </WidgetCard>

      {/* Origem dos leads (linha clicável vira filtro global) */}
      <WidgetCard
        title="De onde vieram os leads no período"
        subtitle="Clique numa linha pra filtrar a página inteira por aquela origem."
      >
        {resumo.isLoading ? (
          <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
        ) : !resumo.data || resumo.data.por_origem.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem leads no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Origem</th>
                  <th className="text-right py-2 font-medium">Leads</th>
                  <th className="text-right py-2 font-medium">Ganhos</th>
                  <th className="text-right py-2 font-medium">% Sucesso</th>
                  <th className="text-right py-2 font-medium">Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {resumo.data.por_origem.map(row => {
                  const conv = row.leads > 0 ? Math.round((row.ganhos / row.leads) * 100) : 0
                  const isActive = origins.includes(row.origem)
                  return (
                    <tr
                      key={row.origem}
                      onClick={() => openLeadsByOrigin(row.origem)}
                      className={cn('border-b border-slate-50 hover:bg-indigo-50 cursor-pointer', isActive && 'bg-indigo-50')}
                    >
                      <td className="py-2.5 text-slate-900 font-medium">
                        <span className="hover:text-indigo-700 hover:underline">
                          {ORIGEM_LABELS[row.origem] ?? row.origem}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.leads}</td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.ganhos}</td>
                      <td className="py-2.5 text-right">
                        <ConversionBadge rate={conv} sample={origemConvSample} />
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">
                        {formatCurrency(row.faturamento)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      <PlannerProfileDrawer
        planner={profilePlanner}
        onClose={() => setProfilePlanner(null)}
      />
    </div>
  )
}
