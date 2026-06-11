import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from 'recharts'
import { useWw2Overview } from '@/hooks/analyticsWeddings/useWw2'
import { FilterBar, type TabProps, type AppliedFilters } from '../components/FilterBar'
import { SectionCard, KpiCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { SerieTemporalChart } from '../components/SerieTemporalChart'
import { formatCurrency, formatNumber } from '../lib/format'

export function VisaoGeral({ filters, onFiltersChange }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Pergunta da aba: "como estamos?" — corta por período/modo, tipo, origem, perfil
          (faixa/convidados/destino), consultor e COMO as reuniões aconteceram (canal SDR/Closer) */}
      <FilterBar value={filters} onChange={onFiltersChange} show={['period', 'dateMode', 'tipo', 'origem', 'faixa', 'convidados', 'destino', 'consultor', 'canal_sdr', 'canal_closer']} />
      <VisaoGeralContent filters={filters} />
    </div>
  )
}

function VisaoGeralContent({ filters }: { filters: AppliedFilters }) {
  const { data, isLoading, error } = useWw2Overview(filters)
  const [drill, setDrill] = useState<DrillContext | null>(null)

  if (isLoading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const { kpis, funnel, conversoes, alertas } = data

  // Funil: agregar por fase, separar Resolução
  const byPhase = funnel.reduce((acc, f) => {
    const k = f.phase_label
    if (!acc[k]) acc[k] = { phase: k, leads: 0, order: f.phase_order ?? 999, slug: f.phase_slug }
    acc[k].leads += f.leads_count
    return acc
  }, {} as Record<string, { phase: string; leads: number; order: number; slug: string }>)
  const phasesData = Object.values(byPhase).sort((a, b) => a.order - b.order)
  const activePhases = phasesData.filter(p => !/resolu/i.test(p.phase))
  const resolutionLeads = phasesData.find(p => /resolu/i.test(p.phase))?.leads ?? 0

  const openDrill = (ctx: DrillContext) => setDrill(ctx)
  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }
  // Tendência: janela de 12 meses terminando no fim do período do filtro (trend precisa de range longo)
  const trend12Start = new Date(new Date(filters.dateEnd).getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()

  return (
    <div className="space-y-5">
      {/* KPIs com comparação */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={`Leads ${kpis.mode === 'cohort' ? 'criados' : 'movimentados'}`}
          value={formatNumber(kpis.leads)}
          prevValue={kpis.leads_prev}
          hint={`Período anterior: ${formatNumber(kpis.leads_prev)}`}
          onClick={() => openDrill({ ...baseCtx, title: 'Leads criados no período' })}
        />
        <KpiCard
          label="Reuniões"
          value={formatNumber(kpis.reunioes)}
          prevValue={kpis.reunioes_prev}
          hint={`Anterior: ${formatNumber(kpis.reunioes_prev)}`}
        />
        <KpiCard
          label="Propostas enviadas"
          value={formatNumber(kpis.propostas)}
          prevValue={kpis.propostas_prev}
          hint={`Anterior: ${formatNumber(kpis.propostas_prev)}`}
        />
        <KpiCard
          label="Casamentos fechados"
          value={formatNumber(kpis.fechados)}
          prevValue={kpis.fechados_prev}
          hint={kpis.ticket_medio ? `Ticket médio: ${formatCurrency(kpis.ticket_medio)}` : `Anterior: ${formatNumber(kpis.fechados_prev)}`}
          onClick={() => openDrill({ ...baseCtx, status: 'fechado_efetivo', title: 'Casamentos fechados' })}
        />
      </div>

      {/* Tendência ao longo do tempo (#7) — vendas/reuniões/leads por período */}
      <SerieTemporalChart
        title="📈 Ao longo do tempo — leads, reuniões e vendas"
        subtitle="Últimos 12 meses. Quantos entraram, fizeram reunião e fecharam em cada período. Troque mês/semana e quantidade/conversão."
        dateStart={trend12Start}
        dateEnd={filters.dateEnd}
        dateMode={filters.dateMode}
        origins={filters.origins}
        faixas={filters.faixas}
        destinos={filters.destinos}
        convidados={filters.convidados}
        consultorIds={filters.consultorIds}
        tipos={filters.tipos}
        canalSdr={filters.canalSdr}
        canalCloser={filters.canalCloser}
      />

      {/* Funil */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard
          className="lg:col-span-2"
          title={`Funil — leads ${filters.dateMode === 'cohort' ? 'do período' : 'movimentados'} por fase`}
          subtitle={resolutionLeads > 0 ? `${formatNumber(resolutionLeads)} cards em Resolução (perdidos/cancelados) escondidos do gráfico` : ' '}
        >
          {activePhases.length === 0 ? <EmptyState message="Nenhum lead nas fases ativas pra esse filtro." /> : (
            <ResponsiveContainer width="100%" height={Math.max(180, activePhases.length * 50)}>
              <BarChart data={activePhases} layout="vertical" margin={{ top: 5, right: 30, left: 90, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis dataKey="phase" type="category" stroke="#64748b" fontSize={11} width={140} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${formatNumber(v)} leads`, '']}
                />
                <Bar dataKey="leads" fill="#4f46e5" radius={[0, 6, 6, 0]} cursor="pointer"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={(p: any) => openDrill({ ...baseCtx, phaseSlug: p.slug, title: `Leads na fase ${p.phase}` })}>
                  <LabelList dataKey="leads" position="right" fill="#1e293b" fontSize={11} formatter={(v) => formatNumber(Number(v))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Conversão entre fases" subtitle="Taxa de avanço de uma fase pra próxima">
          {conversoes.length === 0 ? <EmptyState message="Sem dados" /> : (
            <div className="space-y-2">
              {conversoes.map((c, idx) => (
                <div key={c.phase_label} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-400 w-4">{idx + 1}.</span>
                    <span className="text-slate-700">{c.phase_label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-700 tabular-nums">{formatNumber(c.leads)}</span>
                    {c.taxa_vs_anterior !== null && (
                      <span className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded ${c.taxa_vs_anterior >= 50 ? 'bg-emerald-50 text-emerald-700' : c.taxa_vs_anterior >= 30 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'}`}>
                        {c.taxa_vs_anterior}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Alertas */}
      <SectionCard title="⚠️ Alertas — leads parados há mais de 7 dias" subtitle="Top 8 por dias parados. Clique pra abrir o card.">
        {alertas.length === 0 ? (
          <EmptyState message="Nenhum lead parado. Tudo fluindo." />
        ) : (
          <table className="w-full text-xs">
            <thead className="text-center text-slate-500">
              <tr>
                <th className="py-2 font-medium">Card</th>
                <th className="py-2 font-medium">Etapa</th>
                <th className="py-2 font-medium">Fase</th>
                <th className="py-2 font-medium text-center">Valor</th>
                <th className="py-2 font-medium text-center">Parado há</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map(a => (
                <tr key={a.card_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2">
                    <a href={`/cards/${a.card_id}`} className="text-indigo-700 hover:underline font-medium">{a.titulo.slice(0, 60)}{a.titulo.length > 60 ? '…' : ''}</a>
                  </td>
                  <td className="py-2 text-slate-700">{a.stage_name}</td>
                  <td className="py-2 text-slate-500">{a.phase_label}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{a.valor_estimado ? formatCurrency(a.valor_estimado) : '—'}</td>
                  <td className="py-2 text-right">
                    <span className={`tabular-nums font-medium ${a.dias_parado > 14 ? 'text-rose-600' : 'text-amber-600'}`}>{a.dias_parado}d</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}
