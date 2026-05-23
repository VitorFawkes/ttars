import { useState } from 'react'
import { Trophy, Target, Clock, Loader2, ListTodo, DollarSign } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { useTeamLeaderboard } from '@/hooks/analytics/useTeamLeaderboard'
import { useTeamPerformance } from '@/hooks/analytics/useTeamPerformance'
import { useTeamSlaCompliance } from '@/hooks/analytics/useTeamSlaCompliance'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { formatCurrency } from '@/utils/whatsappFormatters'
import WidgetCard from './WidgetCard'
import { cn } from '@/lib/utils'

const PHASES: { value: string; label: string }[] = [
  { value: 'sdr', label: 'SDR' },
  { value: 'planner', label: 'Planner' },
  { value: 'pos_venda', label: 'Pós-venda' },
]

// RPCs analytics_team_* retornam taxas já como 0-100 (não 0-1), apenas formata.
function pct(v: number): string {
  return `${v.toFixed(0)}%`
}

function WinRateBadge({ rate }: { rate: number }) {
  const tone =
    rate >= 50
      ? 'bg-emerald-50 text-emerald-700'
      : rate >= 30
        ? 'bg-amber-50 text-amber-700'
        : 'bg-rose-50 text-rose-700'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums', tone)}>
      {pct(rate)}
    </span>
  )
}

function ComplianceBadge({ rate }: { rate: number | null }) {
  if (rate === null) {
    return <span className="text-xs text-slate-400">—</span>
  }
  const tone =
    rate >= 90
      ? 'bg-emerald-50 text-emerald-700'
      : rate >= 70
        ? 'bg-amber-50 text-amber-700'
        : 'bg-rose-50 text-rose-700'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums', tone)}>
      {pct(rate)}
    </span>
  )
}

export default function TeamView() {
  const [phaseTab, setPhaseTab] = useState<string>('sdr')
  const leaderboard = useTeamLeaderboard()
  const phasePerf = useTeamPerformance(phaseTab)
  const sla = useTeamSlaCompliance()
  const drillDown = useDrillDownStore()

  const openWonByOwner = (ownerId: string, ownerName: string) => {
    drillDown.open({
      label: `Vendas de ${ownerName}`,
      drillSource: 'closed_deals',
      drillOwnerId: ownerId,
    })
  }

  const openOpenByOwner = (ownerId: string, ownerName: string) => {
    drillDown.open({
      label: `Cards abertos de ${ownerName}`,
      drillSource: 'current_stage',
      drillOwnerId: ownerId,
    })
  }

  // KPIs agregados do leaderboard
  const totalReceita = leaderboard.data?.reduce((acc, r) => acc + r.receita_total, 0) ?? 0
  const totalGanhos = leaderboard.data?.reduce((acc, r) => acc + r.cards_ganhos, 0) ?? 0
  const totalAbertos = leaderboard.data?.reduce((acc, r) => acc + r.cards_abertos, 0) ?? 0
  const totalVencidas = leaderboard.data?.reduce((acc, r) => acc + r.tarefas_vencidas, 0) ?? 0

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Equipe</h1>
        <p className="text-sm text-slate-500 mt-1">
          Performance do time consolidado, breakdown por fase (SDR, Planner, Pós-venda) e cumprimento de SLA.
        </p>
      </header>

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
        ) : !leaderboard.data || leaderboard.data.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem dados de equipe para esse período
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
                  <th className="text-right py-2 font-medium">Win rate</th>
                  <th className="text-right py-2 font-medium">Receita</th>
                  <th className="text-right py-2 font-medium">Ticket médio</th>
                  <th className="text-right py-2 font-medium">Abertos</th>
                  <th className="text-right py-2 font-medium">Vencidas</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.data.map((row, idx) => (
                  <tr key={row.user_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="py-2.5 text-slate-900 font-medium">
                      <button
                        onClick={() => openWonByOwner(row.user_id, row.user_nome)}
                        className="hover:text-indigo-600 hover:underline text-left"
                        title="Ver vendas dessa pessoa"
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
                    <td className="py-2.5 text-right">
                      <WinRateBadge rate={row.win_rate} />
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
        <div className="flex gap-1 mb-4 border-b border-slate-100">
          {PHASES.map(p => (
            <button
              key={p.value}
              onClick={() => setPhaseTab(p.value)}
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
                        onClick={() => openWonByOwner(row.user_id, row.user_nome)}
                        className="hover:text-indigo-600 hover:underline text-left"
                        title="Ver vendas dessa pessoa"
                      >
                        {row.user_nome}
                      </button>
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.total_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.won_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.lost_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.open_cards}</td>
                    <td className="py-2.5 text-right">
                      <WinRateBadge rate={row.conversion_rate} />
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
                      <ComplianceBadge rate={row.compliance_rate} />
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
    </div>
  )
}
