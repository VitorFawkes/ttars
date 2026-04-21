import { useEffect, useMemo, useState } from 'react'
import { DollarSign, Target, TrendingUp, Clock, AlertTriangle, Zap, Users } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import KpiCard from '@/components/analytics/KpiCard'
import WidgetCard from '../WidgetCard'
import AlertsPanel, { type AlertItem } from '../AlertsPanel'
import CardTimelineDrawer from '../CardTimelineDrawer'
import {
  useOverviewKpisV2, useRevenueTimeseriesV2, useStageConversion, useReworkRate,
  useHandoffSpeed, useWhatsappSpeedV2, useDroppedBalls,
} from '@/hooks/analyticsV2/useAnalyticsV2Rpcs'
import { useAnalyticsV2Filters } from '@/hooks/analyticsV2/useAnalyticsV2Filters'

function formatBRL(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}
function formatPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${Number(v).toFixed(1)}%`
}
function formatMinutes(m: number | null | undefined): string {
  if (m == null) return '—'
  if (m < 60) return `${Math.round(m)}min`
  const h = m / 60
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

export default function ComercialDashboard() {
  const applyPersonaDefaults = useAnalyticsV2Filters(s => s.applyPersonaDefaults)
  useEffect(() => { applyPersonaDefaults('comercial') }, [applyPersonaDefaults])

  const [drillCardId, setDrillCardId] = useState<string | null>(null)
  const [drillCardTitle, setDrillCardTitle] = useState<string | undefined>()

  const { data: kpis, isLoading: loadingKpis } = useOverviewKpisV2()
  const { data: timeseries, isLoading: loadingTs } = useRevenueTimeseriesV2()
  const { data: stageConv, isLoading: loadingSc } = useStageConversion()
  const { data: rework } = useReworkRate()
  const { data: handoff } = useHandoffSpeed()
  const { data: whatsapp } = useWhatsappSpeedV2()
  const { data: dropped } = useDroppedBalls(240)

  const chartData = useMemo(() => (timeseries ?? []).map(p => ({
    period: p.period,
    receita: Number(p.total_receita ?? 0),
    ganhos: Number(p.count_won ?? 0),
  })), [timeseries])

  const alerts = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = []
    const frt = (whatsapp?.overall?.avg_business_minutes as number | null | undefined) ?? null
    if (frt != null && frt > 120) {
      out.push({
        id: 'frt_high', severity: 'warning',
        title: 'Tempo de 1ª resposta acima de 2h',
        description: `Média atual: ${formatMinutes(frt)} (threshold: 120min).`,
      })
    }
    const ho = (handoff?.summary?.avg_minutes as number | null | undefined) ?? null
    if (ho != null && ho > 240) {
      out.push({
        id: 'handoff_slow', severity: 'warning',
        title: 'Handoff SDR→Planner demorando',
        description: `Média atual: ${formatMinutes(ho)}.`,
      })
    }
    const rw = (rework?.rework_pct as number | null | undefined) ?? null
    if (rw != null && rw > 20) {
      out.push({
        id: 'rework_high', severity: 'warning',
        title: 'Retrabalho acima de 20%',
        description: `${rework?.rework_count} de ${rework?.total_moved} cards movidos voltaram.`,
      })
    }
    const dp = (dropped?.summary?.total_dropped as number | undefined) ?? 0
    if (dp > 5) {
      out.push({
        id: 'dropped_balls', severity: 'critical',
        title: `${dp} clientes sem resposta há >4h`,
        description: 'Mensagens entrando sem ninguém retomar.',
      })
    }
    return out
  }, [whatsapp, handoff, rework, dropped])

  const droppedCards = (dropped?.cards ?? []) as Array<Record<string, unknown>>
  const byPairs = (handoff?.by_pair ?? []) as Array<Record<string, unknown>>
  const bySource = (whatsapp?.by_source ?? []) as Array<Record<string, unknown>>

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">💼 Comercial</h1>
        <p className="text-sm text-slate-500 mt-1">Macro SDR + Vendas — funil completo, fonte dos vazamentos, saúde operacional.</p>
      </header>

      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Receita do período"
          value={formatBRL(kpis?.receita_total as number | null)}
          icon={DollarSign}
          color="text-emerald-600" bgColor="bg-emerald-50"
          isLoading={loadingKpis}
        />
        <KpiCard
          title="Ganhos Planner"
          value={String(kpis?.ganho_planner_count ?? '—')}
          subtitle={kpis?.ganho_planner_rate != null ? `${Number(kpis.ganho_planner_rate).toFixed(1)}% conversão` : undefined}
          icon={Target}
          color="text-indigo-600" bgColor="bg-indigo-50"
          isLoading={loadingKpis}
        />
        <KpiCard
          title="Ticket médio"
          value={formatBRL(kpis?.ticket_medio as number | null)}
          icon={TrendingUp}
          color="text-blue-600" bgColor="bg-blue-50"
          isLoading={loadingKpis}
        />
        <KpiCard
          title="FRT (1ª resposta)"
          value={formatMinutes(whatsapp?.overall?.avg_business_minutes as number | null | undefined)}
          subtitle={whatsapp?.overall?.median_business_minutes != null
            ? `Mediana: ${formatMinutes(whatsapp.overall.median_business_minutes as number)}`
            : undefined}
          icon={Zap}
          color="text-sky-600" bgColor="bg-sky-50"
        />
      </div>

      <WidgetCard title="Receita e ganhos ao longo do tempo" subtitle="Agregado mensal">
        {loadingTs ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">Carregando…</div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">Sem dados no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1"
                tickFormatter={(v) => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v as number)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n: string) => n === 'receita' ? formatBRL(v) : String(v)}
              />
              <Line yAxisId="left" type="monotone" dataKey="receita" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="ganhos" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </WidgetCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard title="Conversão por etapa" subtitle="% que avançou pra etapa de ordem maior">
          {loadingSc ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Carregando…</div>
          ) : !stageConv || stageConv.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem movimentos no período</div>
          ) : (
            <div className="space-y-2">
              {stageConv.slice(0, 10).map(s => (
                <div key={s.stage_id} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-slate-600 truncate" title={s.stage_name}>{s.stage_name}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden relative">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
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

        <WidgetCard title="FRT por fonte" subtitle="Tempo de 1ª resposta (horário útil) por origem">
          {bySource.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem respostas no período</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 font-medium">Fonte</th>
                    <th className="text-right py-2 font-medium">Respostas</th>
                    <th className="text-right py-2 font-medium">Média</th>
                    <th className="text-right py-2 font-medium">Mediana</th>
                    <th className="text-right py-2 font-medium">P90</th>
                  </tr>
                </thead>
                <tbody>
                  {bySource.slice(0, 8).map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium text-slate-900">{String(row.origem ?? '—')}</td>
                      <td className="py-2 text-right text-slate-600">{String(row.responses ?? 0)}</td>
                      <td className="py-2 text-right text-slate-600">{formatMinutes(row.avg_business_minutes as number)}</td>
                      <td className="py-2 text-right text-slate-600">{formatMinutes(row.median_business_minutes as number)}</td>
                      <td className="py-2 text-right text-slate-600">{formatMinutes(row.p90_business_minutes as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WidgetCard>
      </div>

      <WidgetCard
        title="Handoff SDR → Planner"
        subtitle="Tempo até o Planner mandar a 1ª mensagem após ganho SDR"
      >
        {byPairs.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem handoffs no período</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="col-span-1">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Total handoffs</dt>
                  <dd className="text-slate-900 font-medium">{String(handoff?.summary?.total_handoffs ?? '—')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Com follow-up</dt>
                  <dd className="text-slate-900 font-medium">{String(handoff?.summary?.with_followup ?? '—')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Sem follow-up</dt>
                  <dd className="text-red-600 font-medium">{String(handoff?.summary?.no_followup ?? '—')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tempo médio</dt>
                  <dd className="text-slate-900 font-medium">{formatMinutes(handoff?.summary?.avg_minutes as number)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Mediana</dt>
                  <dd className="text-slate-900 font-medium">{formatMinutes(handoff?.summary?.median_minutes as number)}</dd>
                </div>
              </dl>
            </div>
            <div className="col-span-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 font-medium">SDR</th>
                    <th className="text-left py-2 font-medium">Planner</th>
                    <th className="text-right py-2 font-medium">Handoffs</th>
                    <th className="text-right py-2 font-medium">Tempo médio</th>
                  </tr>
                </thead>
                <tbody>
                  {byPairs.slice(0, 6).map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 text-slate-900">{String(p.sdr_name ?? '—')}</td>
                      <td className="py-2 text-slate-600">{String(p.planner_name ?? '—')}</td>
                      <td className="py-2 text-right text-slate-600">{String(p.handoffs ?? 0)}</td>
                      <td className="py-2 text-right text-slate-600">{formatMinutes(p.avg_minutes as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </WidgetCard>

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
                {droppedCards.slice(0, 10).map((c, i) => (
                  <tr
                    key={i}
                    onClick={() => { setDrillCardId(String(c.card_id)); setDrillCardTitle(String(c.titulo ?? '')) }}
                    className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50"
                  >
                    <td className="py-2 text-slate-900 font-medium max-w-[240px] truncate" title={String(c.titulo ?? '')}>
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
        <KpiCard title="Leads no período" value={String(kpis?.total_leads ?? '—')} icon={Users}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingKpis} />
        <KpiCard title="Em aberto" value={String(kpis?.total_open ?? '—')} icon={Clock}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingKpis} />
        <KpiCard title="Retrabalho" value={rework ? formatPct(rework.rework_pct) : '—'} icon={AlertTriangle}
          color="text-amber-600" bgColor="bg-amber-50" />
        <KpiCard title="Ciclo médio (dias)" value={String(kpis?.ciclo_medio_dias ?? '—')} icon={Clock}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingKpis} />
      </div>

      <CardTimelineDrawer
        cardId={drillCardId}
        cardTitle={drillCardTitle}
        onOpenChange={(open) => { if (!open) setDrillCardId(null) }}
      />
    </div>
  )
}
