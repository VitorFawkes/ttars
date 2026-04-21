import { useEffect, useMemo, useState } from 'react'
import { Package, Plane, ShieldCheck, AlertTriangle, CheckCircle2, Users } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import WidgetCard from '../WidgetCard'
import AlertsPanel, { type AlertItem } from '../AlertsPanel'
import CardTimelineDrawer from '../CardTimelineDrawer'
import {
  useTripReadiness, useFieldCompleteness, useTaskCompletionByPerson, useDroppedBalls,
} from '@/hooks/analyticsV2/useAnalyticsV2Rpcs'
import { useAnalyticsV2Filters } from '@/hooks/analyticsV2/useAnalyticsV2Filters'

function formatPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${Number(v).toFixed(1)}%`
}

export default function PosDashboard() {
  const applyPersonaDefaults = useAnalyticsV2Filters(s => s.applyPersonaDefaults)
  useEffect(() => { applyPersonaDefaults('pos') }, [applyPersonaDefaults])

  const [drillCardId, setDrillCardId] = useState<string | null>(null)
  const [drillTitle, setDrillTitle] = useState<string | undefined>()

  const { data: readiness, isLoading: loadingReady } = useTripReadiness()
  const { data: field } = useFieldCompleteness('pos')
  const { data: tasks } = useTaskCompletionByPerson()
  const { data: dropped } = useDroppedBalls(240)

  const summary = readiness?.summary ?? { total_trips: 0, at_risk: 0, avg_readiness_pct: null, fully_ready: 0 }
  const trips = (readiness?.trips ?? []) as Array<Record<string, unknown>>
  const byPerson = (field?.by_person ?? []) as Array<{ user_id: string; user_name: string; cards: number; avg_score: number }>
  const people = (tasks ?? []) as Array<Record<string, unknown>>
  const droppedCards = (dropped?.cards ?? []) as Array<Record<string, unknown>>

  const atRiskTrips = useMemo(() => trips.filter(t => t.at_risk === true), [trips])

  const alerts = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = []
    if (summary.at_risk > 0) {
      out.push({
        id: 'trips_at_risk', severity: 'critical',
        title: `${summary.at_risk} viagens em risco`,
        description: 'Partida em ≤7 dias com prontidão < 100%.',
      })
    }
    const overload = people.filter(p => Number(p.atrasadas_abertas ?? 0) > 10)
    if (overload.length > 0) {
      out.push({
        id: 'overload', severity: 'warning',
        title: `${overload.length} Concierge(s) com mais de 10 tarefas atrasadas`,
        description: overload.slice(0, 2).map(p => p.user_name).join(', '),
      })
    }
    return out
  }, [summary, people])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">🛠️ Pós-Venda</h1>
        <p className="text-sm text-slate-500 mt-1">Prontidão operacional, viagens em risco, carga do time de Concierge.</p>
      </header>

      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Prontidão média"
          value={formatPct(summary.avg_readiness_pct as number | null)}
          subtitle={summary.total_trips != null ? `${summary.total_trips} viagens` : undefined}
          icon={ShieldCheck}
          color="text-emerald-600" bgColor="bg-emerald-50"
          isLoading={loadingReady}
        />
        <KpiCard
          title="Viagens em risco"
          value={String(summary.at_risk ?? '—')}
          subtitle="Partida ≤7d, < 100% pronta"
          icon={AlertTriangle}
          color="text-red-600" bgColor="bg-red-50"
          isLoading={loadingReady}
        />
        <KpiCard
          title="100% prontas"
          value={String(summary.fully_ready ?? '—')}
          icon={CheckCircle2}
          color="text-green-600" bgColor="bg-green-50"
          isLoading={loadingReady}
        />
        <KpiCard
          title="Quality score Pós"
          value={field?.overall_avg_score != null ? `${Number(field.overall_avg_score).toFixed(0)}%` : '—'}
          subtitle={field?.total_cards != null ? `${field.total_cards} cards` : undefined}
          icon={Package}
          color="text-blue-600" bgColor="bg-blue-50"
        />
      </div>

      <WidgetCard
        title="Viagens em risco"
        subtitle={atRiskTrips.length === 0 ? 'Nenhuma viagem em risco 👏' : `${atRiskTrips.length} partidas próximas sem tudo pronto`}
      >
        {atRiskTrips.length === 0 ? (
          <div className="h-24" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 font-medium">Viagem</th>
                  <th className="text-left py-2 font-medium">Concierge</th>
                  <th className="text-right py-2 font-medium">Dias p/ partir</th>
                  <th className="text-right py-2 font-medium">Prontidão</th>
                  <th className="text-right py-2 font-medium">Itens prontos</th>
                </tr>
              </thead>
              <tbody>
                {atRiskTrips.slice(0, 15).map((t, i) => (
                  <tr
                    key={i}
                    onClick={() => { setDrillCardId(String(t.card_id)); setDrillTitle(String(t.titulo ?? '')) }}
                    className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50"
                  >
                    <td className="py-2 text-slate-900 font-medium max-w-[240px] truncate" title={String(t.titulo ?? '')}>
                      {String(t.titulo ?? '—')}
                    </td>
                    <td className="py-2 text-slate-600">{String(t.pos_owner_name ?? '—')}</td>
                    <td className="py-2 text-right text-red-600 font-medium">
                      {t.days_to_departure != null ? `${t.days_to_departure}d` : '—'}
                    </td>
                    <td className="py-2 text-right text-slate-600">{formatPct(t.readiness_pct as number | null)}</td>
                    <td className="py-2 text-right text-slate-500">
                      {String(t.ready ?? 0)}/{String(t.total_operacionais ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard title="Carga do time de Concierge" subtitle="Conclusão e tarefas atrasadas por pessoa">
          {people.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem tarefas no período</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 font-medium">Concierge</th>
                    <th className="text-right py-2 font-medium">Conclusão</th>
                    <th className="text-right py-2 font-medium">No prazo</th>
                    <th className="text-right py-2 font-medium">Atrasadas</th>
                  </tr>
                </thead>
                <tbody>
                  {people.slice(0, 10).map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium text-slate-900">{String(p.user_name ?? '—')}</td>
                      <td className="py-2 text-right text-slate-600">{formatPct(p.completion_pct as number | null)}</td>
                      <td className="py-2 text-right text-slate-600">{formatPct(p.on_time_pct as number | null)}</td>
                      <td className={`py-2 text-right font-medium ${Number(p.atrasadas_abertas ?? 0) > 5 ? 'text-red-600' : 'text-slate-600'}`}>
                        {String(p.atrasadas_abertas ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Quality score por Concierge" subtitle="Preenchimento dos cards que passaram pela pós">
          {byPerson.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem cards com score</div>
          ) : (
            <div className="space-y-2">
              {byPerson.slice(0, 10).map(p => (
                <div key={p.user_id} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-slate-700 truncate" title={p.user_name}>{p.user_name}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden relative">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
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

      <WidgetCard
        title="Clientes esperando resposta"
        subtitle={dropped?.summary?.total_dropped ? `${dropped.summary.total_dropped} com >4h parados` : 'Dentro do SLA'}
      >
        {droppedCards.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-sm text-slate-400">Nenhum cliente parado 👏</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 font-medium">Card</th>
                  <th className="text-left py-2 font-medium">Etapa</th>
                  <th className="text-left py-2 font-medium">Dono</th>
                  <th className="text-right py-2 font-medium">Esperando</th>
                </tr>
              </thead>
              <tbody>
                {droppedCards.slice(0, 8).map((c, i) => (
                  <tr
                    key={i}
                    onClick={() => { setDrillCardId(String(c.card_id)); setDrillTitle(String(c.titulo ?? '')) }}
                    className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50"
                  >
                    <td className="py-2 text-slate-900 font-medium max-w-[220px] truncate" title={String(c.titulo ?? '')}>
                      {String(c.titulo ?? '—')}
                    </td>
                    <td className="py-2 text-slate-600">{String(c.stage_name ?? '—')}</td>
                    <td className="py-2 text-slate-600">{String(c.owner_name ?? '—')}</td>
                    <td className="py-2 text-right text-red-600 font-medium tabular-nums">
                      {Number(c.waiting_business_hours ?? 0).toFixed(1)}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Total de viagens" value={String(summary.total_trips ?? '—')} icon={Plane}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingReady} />
        <KpiCard title="Pessoas com tarefa" value={String(people.length)} icon={Users}
          color="text-slate-600" bgColor="bg-slate-100" />
        <KpiCard title="Atrasadas (total)" value={String(people.reduce((s, p) => s + Number(p.atrasadas_abertas ?? 0), 0))}
          icon={AlertTriangle} color="text-amber-600" bgColor="bg-amber-50" />
        <KpiCard title="Prontidão média" value={formatPct(summary.avg_readiness_pct as number | null)} icon={ShieldCheck}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingReady} />
      </div>

      <CardTimelineDrawer
        cardId={drillCardId}
        cardTitle={drillTitle}
        onOpenChange={(open) => { if (!open) setDrillCardId(null) }}
      />
    </div>
  )
}
