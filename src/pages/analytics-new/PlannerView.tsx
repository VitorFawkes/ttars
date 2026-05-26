import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Trophy, ListX, Clock, Loader2, Layers } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { useFunnelConversion, useLossReasons } from '@/hooks/analytics/useFunnelConversion'
import { useFunnelVelocity } from '@/hooks/analytics/useFunnelVelocity'
import { useTeamLeaderboard } from '@/hooks/analytics/useTeamLeaderboard'
import { useTeamPerformance } from '@/hooks/analytics/useTeamPerformance'
import { useTeamTicketVariation } from '@/hooks/analytics/useTeamTicketVariation'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useResumoOverview, useResumoOverviewPrevious } from '@/hooks/analytics/useResumoOverview'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/utils/whatsappFormatters'
import WidgetCard from './WidgetCard'
import { cn } from '@/lib/utils'

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

function pct(v: number): string {
  return `${v.toFixed(0)}%`
}

function ConversionBadge({ rate }: { rate: number }) {
  const tone =
    rate >= 50 ? 'bg-emerald-50 text-emerald-700'
    : rate >= 30 ? 'bg-amber-50 text-amber-700'
    : 'bg-rose-50 text-rose-700'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums', tone)}>
      {pct(rate)}
    </span>
  )
}

export default function PlannerView() {
  const [individualUser, setIndividualUser] = useState<string | null>(null)
  void individualUser

  const funnel = useFunnelConversion()
  const velocity = useFunnelVelocity()
  const lossReasons = useLossReasons()
  const leaderboard = useTeamLeaderboard()
  const plannerPerf = useTeamPerformance('planner')
  const ticketVar = useTeamTicketVariation()
  const resumo = useResumoOverview()
  const resumoPrev = useResumoOverviewPrevious()
  const plannerByOrigem = usePlannerByOrigem()

  // Para delta semana vs semana — usamos `ganhos` e `faturamento` do período anterior
  const prevGanhos = resumoPrev.data?.empresa.kpis.ganhos
  const prevFaturamento = resumoPrev.data?.empresa.kpis.faturamento

  // Pivot Planner × Origem: { plannerId: { nome, origens: { origem: row } } }
  const plannerOrigemPivot = useMemo(() => {
    const rows = plannerByOrigem.data ?? []
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
    // Ordena origens por volume total
    const origensList = Array.from(origensSet).sort((a, b) => {
      const aTotal = rows.filter(r => r.origem === a).reduce((s, r) => s + r.leads, 0)
      const bTotal = rows.filter(r => r.origem === b).reduce((s, r) => s + r.leads, 0)
      return bTotal - aTotal
    })
    const plannersList = Array.from(byPlanner.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.totalLeads - a.totalLeads)
    return { origensList, plannersList }
  }, [plannerByOrigem.data])

  // Etapas do planner
  const plannerStages = (funnel.data ?? []).filter(s => s.phase_slug === 'planner').sort((a, b) => a.ordem - b.ordem)
  const totalPlanner = plannerStages.reduce((sum, s) => sum + s.current_count, 0)

  // Leaderboard só com quem atua em Planner
  const plannerLeaderboard = (leaderboard.data ?? []).filter(row => row.fases.includes('planner'))

  // Velocidade apenas de etapas do Planner
  const plannerVelocity = (velocity.data ?? []).filter(v => v.phase_slug === 'planner').sort((a, b) => a.ordem - b.ordem)

  // KPIs hero a partir do leaderboard (cards distintos no planner)
  const ganhosTotal = plannerLeaderboard.reduce((s, r) => s + r.cards_ganhos, 0)
  const perdidosTotal = plannerLeaderboard.reduce((s, r) => s + r.cards_perdidos, 0)
  const receitaTotal = plannerLeaderboard.reduce((s, r) => s + r.receita_total, 0)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Planner (Travel Planner / Closer)</h1>
        <p className="text-sm text-slate-500 mt-1">
          O que está acontecendo com quem fecha a venda: propostas em andamento, ganhos no período,
          quem está demorando e por que estamos perdendo.
        </p>
      </header>

      {/* KPIs hero */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Cards na mesa do Planner"
          value={totalPlanner}
          icon={Briefcase}
          color="text-blue-600"
          bgColor="bg-blue-50"
          isLoading={funnel.isLoading}
        />
        <KpiCard
          title="Ganhos no período"
          value={ganhosTotal}
          icon={Trophy}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={leaderboard.isLoading}
          delta={prevGanhos !== undefined ? { current: ganhosTotal, previous: prevGanhos } : undefined}
        />
        <KpiCard
          title="Perdidos no período"
          value={perdidosTotal}
          icon={ListX}
          color={perdidosTotal > 0 ? 'text-rose-600' : 'text-slate-400'}
          bgColor={perdidosTotal > 0 ? 'bg-rose-50' : 'bg-slate-50'}
          isLoading={leaderboard.isLoading}
        />
        <KpiCard
          title="Receita total"
          value={formatCurrency(receitaTotal)}
          icon={Trophy}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={leaderboard.isLoading}
          delta={prevFaturamento !== undefined ? { current: receitaTotal, previous: prevFaturamento } : undefined}
        />
      </div>

      {/* Etapas do planner */}
      <WidgetCard
        title="Carteira por etapa do Planner"
        subtitle="Quantos cards estão em cada etapa nesse momento"
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
                <div key={stage.stage_id} className="flex items-center gap-3">
                  <span className="text-sm text-slate-700 w-64 truncate">{stage.stage_nome}</span>
                  <div className="flex-1 bg-slate-100 rounded h-6 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full transition-all"
                      style={{ width: `${Math.max(2, share)}%` }}
                    />
                  </div>
                  <span className="w-12 text-sm text-slate-700 tabular-nums text-right">
                    {stage.current_count}
                  </span>
                  <span className="w-14 text-right text-xs text-slate-500 tabular-nums">
                    {share.toFixed(0)}%
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </WidgetCard>

      {/* Leaderboard Planner */}
      <WidgetCard
        title="Ranking dos Planners"
        subtitle="Quem está na mesa do Planner no período — cards, ganhos, perdidos, receita"
      >
        {leaderboard.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : plannerLeaderboard.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Nenhum Planner atuou no período
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
                  <tr key={row.user_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="py-2.5 text-slate-900 font-medium">
                      <button
                        onClick={() => setIndividualUser(row.user_id)}
                        className="hover:text-indigo-600 hover:underline text-left"
                      >
                        {row.user_nome}
                      </button>
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_envolvidos}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_ganhos}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={cn(row.cards_perdidos > 0 ? 'text-rose-700' : 'text-slate-400')}>
                        {row.cards_perdidos}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <ConversionBadge rate={row.win_rate} />
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

      {/* Tempo nas etapas — velocity */}
      <WidgetCard
        title="Quanto tempo cada etapa leva"
        subtitle="Tempo típico (mediana) e o caso pior (quem demora mais) por etapa"
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
                  <tr key={row.stage_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-900 font-medium">{row.stage_nome}</td>
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
        )}
      </WidgetCard>

      {/* Performance Planner detalhada */}
      <WidgetCard
        title="Detalhe por Planner"
        subtitle="Conversão, ticket médio e ciclo médio (tempo do recebimento até fechar/perder)"
      >
        {plannerPerf.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !plannerPerf.data || plannerPerf.data.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem dados de performance Planner no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Pessoa</th>
                  <th className="text-right py-2 font-medium">Total</th>
                  <th className="text-right py-2 font-medium">Ganhos</th>
                  <th className="text-right py-2 font-medium">Perdidos</th>
                  <th className="text-right py-2 font-medium">Abertos</th>
                  <th className="text-right py-2 font-medium">% Sucesso</th>
                  <th className="text-right py-2 font-medium">Ticket médio</th>
                  <th className="text-right py-2 font-medium">Ciclo (dias)</th>
                </tr>
              </thead>
              <tbody>
                {plannerPerf.data.map(row => (
                  <tr key={row.user_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-900 font-medium">{row.user_nome}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.total_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.won_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.lost_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.open_cards}</td>
                    <td className="py-2.5 text-right">
                      <ConversionBadge rate={row.conversion_rate} />
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {formatCurrency(row.ticket_medio)}
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {row.ciclo_medio_dias > 0 ? row.ciclo_medio_dias.toFixed(0) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Variação de ticket */}
      <WidgetCard
        title="Variação de ticket por Planner"
        subtitle="Quem tem ticket consistente vs quem oscila muito (uma venda grande pode enganar a média)"
      >
        {ticketVar.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !ticketVar.data || ticketVar.data.length === 0 ? (
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
                {ticketVar.data.map(row => {
                  const spread = row.ticket_max - row.ticket_min
                  const muitoVariavel = row.cards_ganhos >= 3 && spread > row.ticket_medio * 2
                  return (
                    <tr key={row.user_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium">{row.user_nome}</td>
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
        subtitle="Os motivos mais frequentes de perda no período — quanto mais 'Sem motivo informado' tiver, menos útil fica"
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
              <div key={reason.motivo} className="flex items-center gap-3">
                <span className="text-sm text-slate-700 w-72 truncate" title={reason.motivo}>
                  {reason.motivo || 'Sem motivo informado'}
                </span>
                <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
                  <div
                    className="bg-rose-400 h-full"
                    style={{ width: `${Math.max(2, reason.percentage)}%` }}
                  />
                </div>
                <span className="w-12 text-sm text-slate-700 tabular-nums text-right">{reason.count}</span>
                <span className="w-12 text-sm text-rose-700 tabular-nums text-right">
                  {reason.percentage.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </WidgetCard>

      {/* Origem × Planner — qual canal cada planner está recebendo */}
      <WidgetCard
        title="Origem dos leads por Planner"
        subtitle="Mostra de onde vêm os leads que cada Planner recebeu. Útil pra avaliar se diferença de conversão é skill ou só mix de canal."
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
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium">{p.nome}</td>
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
                            <span className="text-slate-700">{cell.ganhos}/{cell.leads}</span>
                            <span className={cn(
                              'ml-1 text-xs',
                              cell.conversao_pct >= 30 ? 'text-emerald-700'
                              : cell.conversao_pct > 0 ? 'text-amber-700'
                              : 'text-slate-400'
                            )}>
                              ({cell.conversao_pct?.toFixed(0) ?? 0}%)
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-3">
              Formato: <span className="font-medium">ganhos/leads (% conversão)</span>. Total inclui leads de todas as origens recebidos pelo Planner no período.
            </p>
          </div>
        )}
      </WidgetCard>

      {/* Origem dos leads que o Planner recebeu */}
      <WidgetCard
        title="De onde vieram os leads no período"
        subtitle="Útil pra comparar conversão por canal — lead de indicação geralmente fecha melhor que mkt"
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
                  return (
                    <tr key={row.origem} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium">
                        {ORIGEM_LABELS[row.origem] ?? row.origem}
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.leads}</td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.ganhos}</td>
                      <td className="py-2.5 text-right">
                        <ConversionBadge rate={conv} />
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
    </div>
  )
}
