import { useEffect, useMemo } from 'react'
import { Target, Trophy, FileText, Users, Percent, TrendingDown } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import WidgetCard from '../WidgetCard'
import AlertsPanel, { type AlertItem } from '../AlertsPanel'
import {
  useOverviewKpisV2, useProposalVersions, useFieldCompleteness, useStageConversion,
  useHandoffSpeed, useReworkRate,
} from '@/hooks/analyticsV2/useAnalyticsV2Rpcs'
import {
  useTripStates, usePostIssues, useReturnCustomers, usePlannerOpenPortfolio,
  useOverdueTasksByOwner, useLossReasonsByPlanner, useProposalToWinVelocity,
} from '@/hooks/analyticsV2/useVendasRpcs'
import { useAnalyticsV2Filters } from '@/hooks/analyticsV2/useAnalyticsV2Filters'

function formatBRL(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}
function formatPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${Number(v).toFixed(1)}%`
}

export default function VendasDashboard() {
  const applyPersonaDefaults = useAnalyticsV2Filters(s => s.applyPersonaDefaults)
  useEffect(() => { applyPersonaDefaults('vendas') }, [applyPersonaDefaults])

  const { data: kpis, isLoading: loadingKpis } = useOverviewKpisV2()
  const { data: proposals } = useProposalVersions()
  const { data: field } = useFieldCompleteness('vendas')
  const { data: stageConv, isLoading: loadingSc } = useStageConversion()
  const { data: handoff } = useHandoffSpeed()
  const { data: rework } = useReworkRate()
  const { data: tripStates } = useTripStates()
  const { data: postIssues } = usePostIssues()
  const { data: returnCustomers } = useReturnCustomers()
  const { data: openPortfolio } = usePlannerOpenPortfolio()
  const { data: overdueTasks } = useOverdueTasksByOwner()
  const { data: lossReasons } = useLossReasonsByPlanner()
  const { data: propToWinVel } = useProposalToWinVelocity()

  const byPlanner = (proposals?.by_planner ?? []) as Array<Record<string, unknown>>
  const byPerson = (field?.by_person ?? []) as Array<{ user_id: string; user_name: string; cards: number; avg_score: number }>

  const alerts = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = []
    const avgVersions = Number(proposals?.summary?.avg_versions ?? 0)
    if (avgVersions > 3) {
      out.push({
        id: 'many_versions', severity: 'warning',
        title: `Média de ${avgVersions.toFixed(1)} versões até aprovar`,
        description: 'Proposta costuma precisar de várias voltas — vale investigar onde trava.',
      })
    }
    const variation = Number(proposals?.summary?.avg_price_variation_pct ?? 0)
    if (variation < -10) {
      out.push({
        id: 'price_drop', severity: 'warning',
        title: 'Preço caindo entre a 1ª versão e a aceita',
        description: `Variação média: ${variation.toFixed(1)}%.`,
      })
    }
    const quality = Number(field?.overall_avg_score ?? 100)
    if (quality < 60) {
      out.push({
        id: 'low_quality', severity: 'warning',
        title: `Quality score médio em ${quality.toFixed(1)}%`,
        description: 'Cards com muitos campos vazios — afeta handoff pro Pós.',
      })
    }
    return out
  }, [proposals, field])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">👥 Vendas (Travel Planner)</h1>
        <p className="text-sm text-slate-500 mt-1">Conversão por Planner, qualidade das propostas, velocidade de fechamento.</p>
      </header>

      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Ganhos Planner"
          value={String(kpis?.ganho_planner_count ?? '—')}
          subtitle={kpis?.ganho_planner_rate != null ? `${Number(kpis.ganho_planner_rate).toFixed(1)}% conversão` : undefined}
          icon={Trophy}
          color="text-emerald-600" bgColor="bg-emerald-50"
          isLoading={loadingKpis}
        />
        <KpiCard
          title="Receita do time"
          value={formatBRL(kpis?.receita_total as number | null)}
          icon={Target}
          color="text-indigo-600" bgColor="bg-indigo-50"
          isLoading={loadingKpis}
        />
        <KpiCard
          title="Versões / proposta"
          value={proposals?.summary?.avg_versions != null ? Number(proposals.summary.avg_versions).toFixed(1) : '—'}
          subtitle={proposals?.summary?.total_accepted != null ? `${proposals.summary.total_accepted} aceitas` : undefined}
          icon={FileText}
          color="text-violet-600" bgColor="bg-violet-50"
        />
        <KpiCard
          title="Quality score"
          value={field?.overall_avg_score != null ? `${Number(field.overall_avg_score).toFixed(0)}%` : '—'}
          subtitle={field?.total_cards != null ? `${field.total_cards} cards` : undefined}
          icon={Percent}
          color="text-blue-600" bgColor="bg-blue-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard title="Propostas por Planner" subtitle="Aceitas no período, versões e variação de preço">
          {byPlanner.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem propostas aceitas no período</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 font-medium">Planner</th>
                    <th className="text-right py-2 font-medium">Aceitas</th>
                    <th className="text-right py-2 font-medium">Versões</th>
                    <th className="text-right py-2 font-medium">Variação preço</th>
                  </tr>
                </thead>
                <tbody>
                  {byPlanner.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium text-slate-900">{String(p.planner_name ?? '—')}</td>
                      <td className="py-2 text-right text-slate-600">{String(p.accepted_count ?? 0)}</td>
                      <td className="py-2 text-right text-slate-600">
                        {p.avg_versions != null ? Number(p.avg_versions).toFixed(1) : '—'}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {p.avg_price_variation_pct != null ? `${Number(p.avg_price_variation_pct).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Quality score por Planner" subtitle="Média de preenchimento dos campos obrigatórios">
          {byPerson.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem cards com score no período</div>
          ) : (
            <div className="space-y-2">
              {byPerson.slice(0, 10).map(p => (
                <div key={p.user_id} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-slate-700 truncate" title={p.user_name}>{p.user_name}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden relative">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, p.avg_score)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-slate-700">
                      {Number(p.avg_score).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-12 text-right text-xs text-slate-500">{p.cards}</div>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>
      </div>

      <WidgetCard title="Funil da fase Planner" subtitle="Conversão de etapa a etapa dentro da área comercial">
        {loadingSc ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Carregando…</div>
        ) : !stageConv || stageConv.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem movimentos</div>
        ) : (
          <div className="space-y-2">
            {stageConv.map(s => (
              <div key={s.stage_id} className="flex items-center gap-3">
                <div className="w-40 text-xs text-slate-700 truncate" title={s.stage_name}>{s.stage_name}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden relative">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, s.conversion_pct)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-slate-700">
                    {s.conversion_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-16 text-right text-xs text-slate-500">
                  {s.advanced}/{s.entered}
                </div>
              </div>
            ))}
          </div>
        )}
      </WidgetCard>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Ticket médio" value={formatBRL(kpis?.ticket_medio as number | null)} icon={Target}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingKpis} />
        <KpiCard title="Viagens vendidas" value={String(kpis?.viagens_vendidas ?? '—')} icon={Users}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingKpis} />
        <KpiCard title="Retrabalho" value={rework ? formatPct(rework.rework_pct) : '—'} icon={TrendingDown}
          color="text-amber-600" bgColor="bg-amber-50" />
        <KpiCard title="Handoffs recebidos" value={String(handoff?.summary?.total_handoffs ?? '—')} icon={Users}
          color="text-slate-600" bgColor="bg-slate-100" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <WidgetCard title="Estado das Viagens Fechadas" subtitle="Distribuição por status">
          {!tripStates ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Carregando…</div>
          ) : (
            <div className="space-y-3">
              {tripStates.by_estado && Object.entries(tripStates.by_estado).map(([estado, info]) => (
                <div key={estado} className="flex items-center justify-between">
                  <div className="text-sm text-slate-600 font-medium capitalize">{estado.replace(/_/g, ' ')}</div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-semibold text-slate-900">{(info as any).count}</div>
                      <div className="text-xs text-slate-400">viagens</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Problemas no Pós-Venda" subtitle="% cards fechados com tarefas vencidas">
          {!postIssues ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Carregando…</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <div className="text-4xl font-bold text-slate-900">{postIssues.issue_pct ?? '—'}%</div>
                <div className="text-sm text-slate-500">de {postIssues.total_closed} fechados</div>
              </div>
              <div className="text-sm text-slate-600">
                <span className="font-medium">{postIssues.with_issues}</span> cards com problemas
              </div>
            </div>
          )}
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <WidgetCard title="Retorno Pós-Viagem (Repeat)" subtitle="Clientes que voltaram para nova viagem">
          {!returnCustomers ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Carregando…</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <div className="text-4xl font-bold text-slate-900">{returnCustomers.total_returning}</div>
                <div className="text-sm text-slate-500">clientes retornando</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 p-2 rounded">
                  <div className="text-xs text-slate-500">Compras médias</div>
                  <div className="text-lg font-semibold text-slate-900">{returnCustomers.avg_repeat_count?.toFixed(1)}</div>
                </div>
                <div className="bg-slate-50 p-2 rounded">
                  <div className="text-xs text-slate-500">Dias até retorno</div>
                  <div className="text-lg font-semibold text-slate-900">{returnCustomers.avg_days_to_repeat?.toFixed(0)}</div>
                </div>
              </div>
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Carteira Aberta por Planner" subtitle="Cards ativos não ganhos / não perdidos">
          {!openPortfolio || openPortfolio.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem carteira aberta</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 font-medium">Planner</th>
                    <th className="text-right py-2 font-medium">Cards</th>
                    <th className="text-right py-2 font-medium">Total</th>
                    <th className="text-right py-2 font-medium">Dias</th>
                  </tr>
                </thead>
                <tbody>
                  {openPortfolio.slice(0, 8).map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium text-slate-900 truncate">{p.planner_name}</td>
                      <td className="py-2 text-right text-slate-600">{p.open_count}</td>
                      <td className="py-2 text-right text-slate-600">{formatBRL(p.total_estimado)}</td>
                      <td className="py-2 text-right text-slate-600">{p.avg_days_open?.toFixed(0) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <WidgetCard title="Tarefas Vencidas do Time" subtitle="Por responsável">
          {!overdueTasks || overdueTasks.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem tarefas vencidas</div>
          ) : (
            <div className="space-y-2">
              {overdueTasks.slice(0, 10).map((o, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-slate-700 truncate" title={o.owner_name}>{o.owner_name}</div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-semibold text-red-600">{o.overdue_count}</span>
                      <span className="text-xs text-slate-500">vencidas</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Antiga: {o.oldest_overdue_days?.toFixed(0)}d | Média: {o.average_overdue_days?.toFixed(1)}d
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Motivos de Perda por Planner" subtitle="Breakdown de cards perdidos">
          {!lossReasons || lossReasons.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem perdas registradas</div>
          ) : (
            <div className="space-y-3">
              {lossReasons.slice(0, 8).map((p, i) => (
                <div key={i} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="text-sm font-medium text-slate-900 mb-2">{p.planner_name}</div>
                  <div className="space-y-1">
                    {Object.entries(p.reasons as Record<string, number>).map(([reason, count]) => (
                      <div key={reason} className="flex justify-between text-xs">
                        <span className="text-slate-600 truncate" title={reason}>{reason}</span>
                        <span className="font-semibold text-slate-900">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>
      </div>

      <WidgetCard title="Tempo Proposta → Ganho por Planner" subtitle="Mediana e p75 de dias entre envio e fechamento">
        {!propToWinVel || propToWinVel.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem dados de propostas</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 font-medium">Planner</th>
                  <th className="text-right py-2 font-medium">Mediana</th>
                  <th className="text-right py-2 font-medium">p75</th>
                  <th className="text-right py-2 font-medium">Amostra</th>
                </tr>
              </thead>
              <tbody>
                {propToWinVel.map((p, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 font-medium text-slate-900 truncate">{p.planner_name}</td>
                    <td className="py-2 text-right text-slate-600">{p.median_days?.toFixed(0) ?? '—'}d</td>
                    <td className="py-2 text-right text-slate-600">{p.p75_days?.toFixed(0) ?? '—'}d</td>
                    <td className="py-2 text-right text-slate-600">{p.sample_count}</td>
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
