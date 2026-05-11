import { useEffect, useMemo, useState } from 'react'
import { Flag, Zap, Percent, AlertTriangle, CheckCircle2, Users, RefreshCw } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import KpiCard from '@/components/analytics/KpiCard'
import WidgetCard from '../WidgetCard'
import AlertsPanel, { type AlertItem } from '../AlertsPanel'
import CardTimelineDrawer from '../CardTimelineDrawer'
import {
  useOverviewKpisV2, useWhatsappSpeedV2, useHandoffSpeed, useCadenceCompliance,
  useDroppedBalls, useFieldCompleteness, useTaskCompletionByPerson,
} from '@/hooks/analyticsV2/useAnalyticsV2Rpcs'
import { useAnalyticsV2Filters } from '@/hooks/analyticsV2/useAnalyticsV2Filters'

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

export default function SdrDashboard() {
  const applyPersonaDefaults = useAnalyticsV2Filters(s => s.applyPersonaDefaults)
  useEffect(() => { applyPersonaDefaults('sdr') }, [applyPersonaDefaults])

  const [drillCardId, setDrillCardId] = useState<string | null>(null)
  const [drillTitle, setDrillTitle] = useState<string | undefined>()

  const { data: kpis, isLoading: loadingKpis } = useOverviewKpisV2()
  const { data: whatsapp } = useWhatsappSpeedV2()
  const { data: handoff } = useHandoffSpeed()
  const { data: cadence } = useCadenceCompliance()
  const { data: dropped } = useDroppedBalls(120)
  const { data: field } = useFieldCompleteness('sdr')
  const { data: tasks } = useTaskCompletionByPerson()

  const byPerson = (field?.by_person ?? []) as Array<{ user_id: string; user_name: string; cards: number; avg_score: number }>
  const byPair = (handoff?.by_pair ?? []) as Array<Record<string, unknown>>
  const byTemplate = (cadence?.by_template ?? []) as Array<Record<string, unknown>>
  const people = (tasks ?? []) as Array<Record<string, unknown>>
  const droppedCards = (dropped?.cards ?? []) as Array<Record<string, unknown>>
  const buckets = (whatsapp?.buckets ?? []) as Array<{ bucket: string; count: number }>

  const alerts = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = []
    const frt = whatsapp?.overall?.avg_business_minutes as number | null | undefined
    if (frt != null && frt > 60) {
      out.push({
        id: 'frt_sdr', severity: 'warning',
        title: 'FRT SDR acima de 1h',
        description: `Média atual: ${formatMinutes(frt)}.`,
      })
    }
    const compl = cadence?.overall?.compliance_pct as number | null | undefined
    if (compl != null && compl < 70) {
      out.push({
        id: 'cadence_low', severity: 'warning',
        title: `Cadência em ${compl.toFixed(0)}% de compliance`,
        description: 'Muitos passos da cadência não estão sendo executados.',
      })
    }
    const noFollowup = Number(handoff?.summary?.no_followup ?? 0)
    if (noFollowup > 3) {
      out.push({
        id: 'no_followup', severity: 'critical',
        title: `${noFollowup} handoffs sem retorno do Planner`,
        description: 'SDR qualificou e o Planner não deu 1ª mensagem.',
      })
    }
    return out
  }, [whatsapp, cadence, handoff])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">📞 SDR</h1>
        <p className="text-sm text-slate-500 mt-1">Handoffs qualificados, FRT, cadência e saúde do funil de pré-venda.</p>
      </header>

      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Handoffs qualificados"
          value={String(kpis?.ganho_sdr_count ?? handoff?.summary?.total_handoffs ?? '—')}
          subtitle={kpis?.ganho_sdr_rate != null ? `${Number(kpis.ganho_sdr_rate).toFixed(1)}% dos leads` : undefined}
          icon={Flag}
          color="text-sky-600" bgColor="bg-sky-50"
          isLoading={loadingKpis}
        />
        <KpiCard
          title="FRT 1ª resposta"
          value={formatMinutes(whatsapp?.overall?.avg_business_minutes as number | null | undefined)}
          subtitle={whatsapp?.overall?.median_business_minutes != null
            ? `Mediana ${formatMinutes(whatsapp.overall.median_business_minutes as number)}`
            : undefined}
          icon={Zap}
          color="text-emerald-600" bgColor="bg-emerald-50"
        />
        <KpiCard
          title="Cadência compliance"
          value={formatPct(cadence?.overall?.compliance_pct as number | null | undefined)}
          subtitle={cadence?.overall?.first_try_pct != null
            ? `${Number(cadence.overall.first_try_pct).toFixed(0)}% na 1ª tentativa`
            : undefined}
          icon={RefreshCw}
          color="text-indigo-600" bgColor="bg-indigo-50"
        />
        <KpiCard
          title="Quality score SDR"
          value={field?.overall_avg_score != null ? `${Number(field.overall_avg_score).toFixed(0)}%` : '—'}
          subtitle={field?.total_cards != null ? `${field.total_cards} cards` : undefined}
          icon={Percent}
          color="text-blue-600" bgColor="bg-blue-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard title="Distribuição do FRT" subtitle="Bucketização do tempo de 1ª resposta">
          {buckets.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem respostas no período</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={buckets} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </WidgetCard>

        <WidgetCard title="Handoffs por SDR×Planner" subtitle="Onde a passagem é mais eficiente">
          {byPair.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem handoffs no período</div>
          ) : (
            <div className="overflow-x-auto">
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
                  {byPair.slice(0, 8).map((p, i) => (
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
          )}
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard title="Cadências ativas" subtitle="Compliance por template">
          {byTemplate.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-slate-400">Sem cadências no período</div>
          ) : (
            <div className="space-y-2">
              {byTemplate.slice(0, 8).map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-36 text-xs text-slate-700 truncate" title={String(t.template_name ?? '')}>
                    {String(t.template_name ?? '—')}
                  </div>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden relative">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Number(t.compliance_pct ?? 0))}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-slate-700">
                      {t.compliance_pct != null ? `${Number(t.compliance_pct).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                  <div className="w-16 text-right text-xs text-slate-500">
                    {String(t.succeeded ?? 0)}/{String(t.total ?? 0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Quality score por SDR" subtitle="Briefing e campos obrigatórios preenchidos">
          {byPerson.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-slate-400">Sem cards com score</div>
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

      <WidgetCard title="Produtividade do time SDR" subtitle="Tarefas concluídas, pontualidade e tipo que mais atrasa">
        {people.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem tarefas no período</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 font-medium">Pessoa</th>
                  <th className="text-right py-2 font-medium">Total</th>
                  <th className="text-right py-2 font-medium">Conclusão</th>
                  <th className="text-right py-2 font-medium">No prazo</th>
                  <th className="text-right py-2 font-medium">Atrasadas</th>
                  <th className="text-left py-2 font-medium">Mais atrasa</th>
                </tr>
              </thead>
              <tbody>
                {people.slice(0, 10).map((p, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 font-medium text-slate-900">{String(p.user_name ?? '—')}</td>
                    <td className="py-2 text-right text-slate-600">{String(p.total ?? 0)}</td>
                    <td className="py-2 text-right text-slate-600">{formatPct(p.completion_pct as number | null)}</td>
                    <td className="py-2 text-right text-slate-600">{formatPct(p.on_time_pct as number | null)}</td>
                    <td className={`py-2 text-right font-medium ${Number(p.atrasadas_abertas ?? 0) > 5 ? 'text-red-600' : 'text-slate-600'}`}>
                      {String(p.atrasadas_abertas ?? 0)}
                    </td>
                    <td className="py-2 text-slate-500">
                      {p.worst_tipo ? `${p.worst_tipo} (${Number(p.worst_tipo_atraso_pct ?? 0).toFixed(0)}%)` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      <WidgetCard
        title="Leads esperando resposta"
        subtitle={dropped?.summary?.total_dropped ? `${dropped.summary.total_dropped} com >2h parados` : 'Tudo em dia 👏'}
      >
        {droppedCards.length === 0 ? (
          <div className="h-16" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 font-medium">Card</th>
                  <th className="text-left py-2 font-medium">Origem</th>
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
                    <td className="py-2 text-slate-900 font-medium max-w-[240px] truncate" title={String(c.titulo ?? '')}>
                      {String(c.titulo ?? '—')}
                    </td>
                    <td className="py-2 text-slate-600">{String(c.origem ?? '—')}</td>
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
        <KpiCard title="Sem follow-up" value={String(handoff?.summary?.no_followup ?? '—')} icon={AlertTriangle}
          color="text-red-600" bgColor="bg-red-50" />
        <KpiCard title="Tempo handoff" value={formatMinutes(handoff?.summary?.avg_minutes as number)} icon={Zap}
          color="text-slate-600" bgColor="bg-slate-100" />
        <KpiCard title="1ª tentativa" value={formatPct(cadence?.overall?.first_try_pct as number)} icon={CheckCircle2}
          color="text-slate-600" bgColor="bg-slate-100" />
      </div>

      <CardTimelineDrawer
        cardId={drillCardId}
        cardTitle={drillTitle}
        onOpenChange={(open) => { if (!open) setDrillCardId(null) }}
      />
    </div>
  )
}
