import { useMemo, useState } from 'react'
import { Trophy, Target, Clock, Loader2, ListTodo, DollarSign, TrendingUp } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import KpiCard from '@/components/analytics/KpiCard'
import { useTeamLeaderboard } from '@/hooks/analytics/useTeamLeaderboard'
import { useTeamPerformance } from '@/hooks/analytics/useTeamPerformance'
import { useTeamSlaCompliance } from '@/hooks/analytics/useTeamSlaCompliance'
import { useTeamAggregateKpis } from '@/hooks/analytics/useTeamAggregateKpis'
import { useTeamIndividualEvolution } from '@/hooks/analytics/useTeamIndividualEvolution'
import { useTeamTicketVariation } from '@/hooks/analytics/useTeamTicketVariation'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { getRankTier, rankBadgeClass, rankTierLabel } from '@/utils/rankColor'
import WidgetCard from './WidgetCard'
import SimpleFilterBar from './SimpleFilterBar'
import { cn } from '@/lib/utils'

const PHASES: { value: string; label: string }[] = [
  { value: 'sdr', label: 'SDR' },
  { value: 'planner', label: 'Planner' },
  { value: 'pos_venda', label: 'Pós-venda' },
]

const PHASE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  ...PHASES,
]

// RPCs analytics_team_* retornam taxas já como 0-100 (não 0-1), apenas formata.
function pct(v: number): string {
  return `${v.toFixed(0)}%`
}

function WinRateBadge({ rate, sample }: { rate: number; sample: readonly number[] }) {
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

function ComplianceBadge({ rate, sample }: { rate: number | null; sample: readonly (number | null)[] }) {
  if (rate === null) {
    return <span className="text-xs text-slate-400">—</span>
  }
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

export default function TeamView() {
  const [phaseFilter, setPhaseFilter] = useState<string>('all')
  const [individualUser, setIndividualUser] = useState<{ id: string; nome: string } | null>(null)
  const leaderboard = useTeamLeaderboard()
  const phaseTab = phaseFilter === 'all' ? 'sdr' : phaseFilter
  const phasePerf = useTeamPerformance(phaseTab)
  const sla = useTeamSlaCompliance()
  const ticketVar = useTeamTicketVariation()
  const drillDown = useDrillDownStore()

  const leaderboardRows = (leaderboard.data ?? []).filter(row =>
    phaseFilter === 'all' ? true : row.fases.includes(phaseFilter)
  )

  // Samples para coloração relativa (top/meio/bottom 25% dentro do grupo visível)
  const leaderboardWinRateSample = useMemo(
    () => leaderboardRows.map(r => r.win_rate),
    [leaderboardRows],
  )
  const phasePerfConvSample = useMemo(
    () => (phasePerf.data ?? []).map(r => r.conversion_rate),
    [phasePerf.data],
  )
  const slaComplianceSample = useMemo(
    () => (sla.data ?? []).map(r => r.compliance_rate),
    [sla.data],
  )

  const openOpenByOwner = (ownerId: string, ownerName: string) => {
    drillDown.open({
      label: `Cards abertos de ${ownerName}`,
      drillSource: 'current_stage',
      drillOwnerId: ownerId,
    })
  }

  // KPIs agregados — vêm de RPC dedicada (cards DISTINTOS). Somar linhas do
  // leaderboard inflava o número porque um card com SDR+Planner+Pós contava 3x.
  const aggregateKpis = useTeamAggregateKpis()
  const totalReceita = aggregateKpis.data?.receita_total ?? 0
  const totalGanhos = aggregateKpis.data?.cards_ganhos ?? 0
  const totalAbertos = aggregateKpis.data?.cards_abertos ?? 0
  const totalVencidas = aggregateKpis.data?.tarefas_vencidas ?? 0

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Equipe</h1>
        <p className="text-sm text-slate-500 mt-1">
          Performance do time consolidado, breakdown por fase (SDR, Planner, Pós-venda) e cumprimento de SLA.
        </p>
      </header>

      <SimpleFilterBar showOrigins={false} myButtonLabel="Eu" />

      {/* Filtro de fase global — afeta leaderboard e tabela de performance */}
      <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-1 w-fit">
        {PHASE_FILTERS.map(p => (
          <button
            key={p.value}
            onClick={() => setPhaseFilter(p.value)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              phaseFilter === p.value
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs do time */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Receita total do time"
          value={formatCurrency(totalReceita)}
          icon={DollarSign}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={leaderboard.isLoading}
        />
        <KpiCard
          title="Ganhos no período"
          value={totalGanhos}
          icon={Trophy}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={leaderboard.isLoading}
        />
        <KpiCard
          title="Cards abertos"
          value={totalAbertos}
          icon={Target}
          color="text-blue-600"
          bgColor="bg-blue-50"
          isLoading={leaderboard.isLoading}
        />
        <KpiCard
          title="Tarefas vencidas"
          value={totalVencidas}
          icon={ListTodo}
          color={totalVencidas > 0 ? 'text-rose-600' : 'text-slate-400'}
          bgColor={totalVencidas > 0 ? 'bg-rose-50' : 'bg-slate-50'}
          isLoading={leaderboard.isLoading}
        />
      </div>

      {/* Leaderboard geral */}
      <WidgetCard
        title="Leaderboard"
        subtitle="Ranking do time no período — receita, win rate e tarefas pendentes"
      >
        {leaderboard.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : leaderboard.error ? (
          <div className="h-32 flex items-center justify-center text-sm text-rose-600">
            Erro ao carregar leaderboard
          </div>
        ) : leaderboardRows.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            {phaseFilter === 'all'
              ? 'Sem dados de equipe para esse período'
              : `Ninguém atuou na fase ${PHASES.find(p => p.value === phaseFilter)?.label} no período`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">#</th>
                  <th className="text-left py-2 font-medium">Pessoa</th>
                  <th className="text-left py-2 font-medium">Fases</th>
                  <th className="text-right py-2 font-medium">Envolvidos</th>
                  <th className="text-right py-2 font-medium">Ganhos</th>
                  <th className="text-right py-2 font-medium">Perdidos</th>
                  <th className="text-right py-2 font-medium">Win rate</th>
                  <th className="text-right py-2 font-medium">Receita</th>
                  <th className="text-right py-2 font-medium">Ticket médio</th>
                  <th className="text-right py-2 font-medium">Abertos</th>
                  <th className="text-right py-2 font-medium">Vencidas</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardRows.map((row, idx) => (
                  <tr key={row.user_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="py-2.5 text-slate-900 font-medium">
                      <button
                        onClick={() => setIndividualUser({ id: row.user_id, nome: row.user_nome })}
                        className="hover:text-indigo-600 hover:underline text-left"
                        title="Ver evolução individual"
                      >
                        {row.user_nome}
                      </button>
                    </td>
                    <td className="py-2.5 text-slate-600">
                      <div className="flex gap-1 flex-wrap">
                        {row.fases.map(f => (
                          <span
                            key={f}
                            className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 uppercase tracking-wide"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_envolvidos}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_ganhos}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={cn(row.cards_perdidos > 0 ? 'text-rose-700' : 'text-slate-400')}>
                        {row.cards_perdidos}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <WinRateBadge rate={row.win_rate} sample={leaderboardWinRateSample} />
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {formatCurrency(row.receita_total)}
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {formatCurrency(row.ticket_medio)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {row.cards_abertos > 0 ? (
                        <button
                          onClick={() => openOpenByOwner(row.user_id, row.user_nome)}
                          className="text-slate-700 hover:text-indigo-600 hover:underline"
                          title="Ver cards abertos dessa pessoa"
                        >
                          {row.cards_abertos}
                        </button>
                      ) : (
                        <span className="text-slate-700">{row.cards_abertos}</span>
                      )}
                    </td>
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

      {/* Performance por fase */}
      <WidgetCard
        title="Performance por fase"
        subtitle="Métricas específicas de cada fase — conversão, ticket médio e ciclo médio por consultor"
      >
        {phaseFilter === 'all' && (
          <div className="flex gap-1 mb-4 border-b border-slate-100">
            {PHASES.map(p => (
              <button
                key={p.value}
                onClick={() => setPhaseFilter(p.value)}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                  phaseTab === p.value
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {phasePerf.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !phasePerf.data || phasePerf.data.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem dados de performance para a fase {PHASES.find(p => p.value === phaseTab)?.label}.
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
                  <th className="text-right py-2 font-medium">Conversão</th>
                  <th className="text-right py-2 font-medium">Ticket médio</th>
                  <th className="text-right py-2 font-medium">Ciclo (dias)</th>
                </tr>
              </thead>
              <tbody>
                {phasePerf.data.map(row => (
                  <tr key={row.user_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-900 font-medium">
                      <button
                        onClick={() => setIndividualUser({ id: row.user_id, nome: row.user_nome })}
                        className="hover:text-indigo-600 hover:underline text-left"
                        title="Ver evolução individual"
                      >
                        {row.user_nome}
                      </button>
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.total_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.won_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.lost_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.open_cards}</td>
                    <td className="py-2.5 text-right">
                      <WinRateBadge rate={row.conversion_rate} sample={phasePerfConvSample} />
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

      {/* SLA Compliance */}
      <WidgetCard
        title="Cumprimento de SLA"
        subtitle="% de transições no prazo configurado em cada etapa — quando há SLA definido"
        action={<Clock className="w-4 h-4 text-slate-300" />}
      >
        {sla.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !sla.data || sla.data.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem dados de SLA no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Pessoa</th>
                  <th className="text-right py-2 font-medium">Transições</th>
                  <th className="text-right py-2 font-medium">No prazo</th>
                  <th className="text-right py-2 font-medium">Atrasadas</th>
                  <th className="text-right py-2 font-medium">Compliance</th>
                  <th className="text-right py-2 font-medium">Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {sla.data.map(row => (
                  <tr key={row.user_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-900 font-medium">{row.user_nome}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.total_transicoes}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.sla_cumpridas}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.sla_violadas}</td>
                    <td className="py-2.5 text-right">
                      <ComplianceBadge rate={row.compliance_rate} sample={slaComplianceSample} />
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {row.tempo_medio_horas > 0 ? `${row.tempo_medio_horas.toFixed(1)}h` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Variação de ticket por consultor */}
      <WidgetCard
        title="Variação de ticket por consultor"
        subtitle="Mín, média e máx por consultor — mostra se alguém puxa muito a média (1 venda grande) vs ticket consistente"
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
                  <th className="text-left py-2 font-medium">Consultor</th>
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
                      <td className="py-2.5 text-slate-900 font-medium">
                        <button
                          onClick={() => setIndividualUser({ id: row.user_id, nome: row.user_nome })}
                          className="hover:text-indigo-600 hover:underline text-left"
                          title="Ver evolução individual"
                        >
                          {row.user_nome}
                        </button>
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_ganhos}</td>
                      <td className="py-2.5 text-right text-slate-600 tabular-nums">{formatCurrency(row.ticket_min)}</td>
                      <td className="py-2.5 text-right text-slate-900 tabular-nums font-medium">
                        {formatCurrency(row.ticket_medio)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span
                          className={cn(
                            muitoVariavel ? 'text-amber-700 font-semibold' : 'text-slate-600'
                          )}
                          title={muitoVariavel ? 'Diferença grande entre min e max — média pode enganar' : undefined}
                        >
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

      <IndividualEvolutionDrawer
        user={individualUser}
        onClose={() => setIndividualUser(null)}
      />
    </div>
  )
}

function IndividualEvolutionDrawer({
  user,
  onClose,
}: {
  user: { id: string; nome: string } | null
  onClose: () => void
}) {
  const evolution = useTeamIndividualEvolution(user?.id ?? null, 6)
  const rows = evolution.data ?? []

  const totalReceita = rows.reduce((acc, r) => acc + r.receita_total, 0)
  const totalGanhos = rows.reduce((acc, r) => acc + r.cards_ganhos, 0)
  const avgTicket = totalGanhos > 0 ? totalReceita / totalGanhos : 0

  const maxReceita = Math.max(...rows.map(r => r.receita_total), 1)
  const maxGanhos = Math.max(...rows.map(r => r.cards_ganhos), 1)

  function formatMes(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
  }

  return (
    <Sheet open={!!user} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            Evolução individual: {user?.nome}
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-500">
            Últimos 6 meses — receita, ganhos, win rate, ticket médio e ciclo
          </SheetDescription>
        </SheetHeader>

        {evolution.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400 mt-6">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400 mt-6">
            Sem dados nos últimos 6 meses
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl p-3 bg-emerald-50">
                <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">Receita 6m</p>
                <p className="text-lg font-bold text-emerald-700 tracking-tight tabular-nums">
                  {formatCurrency(totalReceita)}
                </p>
              </div>
              <div className="rounded-xl p-3 bg-indigo-50">
                <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">Ganhos 6m</p>
                <p className="text-lg font-bold text-indigo-700 tracking-tight tabular-nums">{totalGanhos}</p>
              </div>
              <div className="rounded-xl p-3 bg-slate-50">
                <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">Ticket médio</p>
                <p className="text-lg font-bold text-slate-700 tracking-tight tabular-nums">
                  {formatCurrency(avgTicket)}
                </p>
              </div>
            </div>

            {/* Gráfico de barras: Receita por mês */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Receita por mês</h4>
              <div className="flex items-end gap-2 h-24">
                {rows.map(r => (
                  <div key={r.mes} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-emerald-500 rounded-t min-h-[2px]"
                      style={{ height: `${(r.receita_total / maxReceita) * 100}%` }}
                      title={`${formatMes(r.mes)}: ${formatCurrency(r.receita_total)}`}
                    />
                    <span className="text-[9px] text-slate-500 tabular-nums">{formatMes(r.mes)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Gráfico de barras: Ganhos por mês */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Cards ganhos por mês</h4>
              <div className="flex items-end gap-2 h-24">
                {rows.map(r => (
                  <div key={r.mes} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-indigo-500 rounded-t min-h-[2px]"
                      style={{ height: `${(r.cards_ganhos / maxGanhos) * 100}%` }}
                      title={`${formatMes(r.mes)}: ${r.cards_ganhos} ganhos`}
                    />
                    <span className="text-[9px] text-slate-500 tabular-nums">{formatMes(r.mes)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabela completa */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Detalhe mês a mês</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                    <th className="text-left py-2 font-medium">Mês</th>
                    <th className="text-right py-2 font-medium">Ganhos</th>
                    <th className="text-right py-2 font-medium">Perdidos</th>
                    <th className="text-right py-2 font-medium">Win rate</th>
                    <th className="text-right py-2 font-medium">Receita</th>
                    <th className="text-right py-2 font-medium">Ticket</th>
                    <th className="text-right py-2 font-medium">Ciclo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.mes} className="border-b border-slate-50">
                      <td className="py-2 text-slate-900 font-medium">{formatMes(r.mes)}</td>
                      <td className="py-2 text-right text-slate-700 tabular-nums">{r.cards_ganhos}</td>
                      <td className="py-2 text-right text-slate-700 tabular-nums">{r.cards_perdidos}</td>
                      <td className="py-2 text-right text-slate-700 tabular-nums">
                        {r.win_rate.toFixed(0)}%
                      </td>
                      <td className="py-2 text-right text-slate-700 tabular-nums">
                        {formatCurrency(r.receita_total)}
                      </td>
                      <td className="py-2 text-right text-slate-700 tabular-nums">
                        {formatCurrency(r.ticket_medio)}
                      </td>
                      <td className="py-2 text-right text-slate-700 tabular-nums">
                        {r.ciclo_medio_dias > 0 ? `${r.ciclo_medio_dias.toFixed(0)}d` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
