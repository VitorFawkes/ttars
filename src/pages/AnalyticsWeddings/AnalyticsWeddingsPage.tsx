import { useState, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Pie, PieChart } from 'recharts'
import { useWeddingsAnalyticsOverview } from '@/hooks/analyticsWeddings/useAnalyticsWeddingsRpcs'
import { useOrg } from '@/contexts/OrgContext'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'

type PeriodOption = '30d' | '90d' | '180d' | '365d' | 'all'

const PERIOD_PRESETS: Record<PeriodOption, { label: string; days: number | null }> = {
  '30d': { label: 'Últimos 30 dias', days: 30 },
  '90d': { label: 'Últimos 90 dias', days: 90 },
  '180d': { label: 'Últimos 6 meses', days: 180 },
  '365d': { label: 'Último ano', days: 365 },
  all: { label: 'Tudo (desde 2024)', days: null },
}

function periodToDates(opt: PeriodOption) {
  const end = new Date()
  const start = new Date()
  if (opt === 'all') {
    start.setFullYear(2024, 0, 1)
  } else {
    start.setDate(end.getDate() - (PERIOD_PRESETS[opt].days ?? 90))
  }
  return {
    dateStart: start.toISOString(),
    dateEnd: end.toISOString(),
  }
}

const COLORS = ['#4f46e5', '#7c3aed', '#0891b2', '#16a34a', '#f59e0b', '#ef4444', '#64748b', '#0ea5e9']

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

export default function AnalyticsWeddingsPage() {
  const { org } = useOrg()
  const { product } = useCurrentProductMeta()
  const [period, setPeriod] = useState<PeriodOption>('90d')

  const dates = useMemo(() => periodToDates(period), [period])
  const { data, isLoading, error } = useWeddingsAnalyticsOverview(dates)

  if (!product || product.slug !== 'WEDDING') {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-2xl">
          <h2 className="text-base font-semibold text-amber-900">Esta página é só para Welcome Weddings</h2>
          <p className="mt-2 text-sm text-amber-800">
            Você está na org <strong>{org?.name ?? '?'}</strong>. Troque para "Welcome Weddings" no seletor de organização (canto superior) para ver os indicadores de Weddings.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse text-slate-500">Carregando indicadores…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-2xl">
          <h2 className="text-base font-semibold text-red-900">Erro ao carregar dados</h2>
          <p className="mt-2 text-sm text-red-800">{String(error)}</p>
        </div>
      </div>
    )
  }

  if (!data || data.error) {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-2xl">
          <h2 className="text-base font-semibold text-amber-900">Sem dados pra mostrar</h2>
          <p className="mt-2 text-sm text-amber-800">{data?.error ?? 'A consulta não retornou dados. Verifique se há leads Wedding no período selecionado.'}</p>
        </div>
      </div>
    )
  }

  const { kpis, funnel, quality, service, conversao_segmento } = data

  // Funil agregado por fase — separa "Resolução" (perdidos/cancelados) das fases ativas
  const funnelByPhase = funnel.reduce((acc, f) => {
    const key = f.phase_name
    if (!acc[key]) acc[key] = { phase: key, leads: 0, order: f.phase_order ?? 999 }
    acc[key].leads += f.leads_count
    return acc
  }, {} as Record<string, { phase: string; leads: number; order: number }>)
  const funnelData = Object.values(funnelByPhase).sort((a, b) => a.order - b.order)
  // Fases que não são "Resolução" (que é onde estão os perdidos/cancelados)
  const activeFunnel = funnelData.filter(f => !/resolu/i.test(f.phase))
  const resolutionTotal = funnelData.find(f => /resolu/i.test(f.phase))?.leads ?? 0

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-baseline justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Welcome Weddings — Indicadores</h1>
          <p className="text-sm text-slate-500 mt-1">Qualidade do lead e qualidade do atendimento, com base em ActiveCampaign</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodOption)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {Object.entries(PERIOD_PRESETS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* === KPIs === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Leads totais" value={kpis.total_leads.toLocaleString('pt-BR')} hint="No período" />
        <KpiCard
          label="Casamentos fechados"
          value={kpis.leads_convertidos_efetivo.toLocaleString('pt-BR')}
          hint={`Taxa: ${kpis.taxa_conversao_efetiva}% · ganho ou em pós-venda`}
        />
        <KpiCard label="Ticket médio (fechados)" value={formatCurrency(kpis.ticket_medio_fechado)} hint={`Receita: ${formatCurrency(kpis.receita_total_fechada)}`} />
        <KpiCard label="Leads em aberto" value={kpis.leads_abertos.toLocaleString('pt-BR')} hint={`Perdidos: ${kpis.leads_perdidos.toLocaleString('pt-BR')}`} />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
        <strong>Como o sistema conta "casamento fechado":</strong> leads marcados como ganho (5 históricos) <em>ou</em> que estão em qualquer etapa da fase Pós-Venda. Isso porque o sistema legado nem sempre marcou status=ganho ao mover pra Pós-Venda — a posição no funil é o sinal mais confiável.
      </div>

      {/* === FUNIL === */}
      <SectionCard
        title="Funil — leads em cada fase agora"
        subtitle={`Leads ativos no pipeline${resolutionTotal > 0 ? ` · ${resolutionTotal.toLocaleString('pt-BR')} em Resolução (perdidos/cancelados) escondidos do gráfico` : ''}`}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={activeFunnel} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" stroke="#64748b" fontSize={12} />
            <YAxis dataKey="phase" type="category" stroke="#64748b" fontSize={12} width={140} />
            <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="leads" fill="#4f46e5" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      {/* === Qualidade do lead === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Faixa de investimento" subtitle={`${quality.por_faixa.reduce((s, f) => s + f.qtd, 0)} leads informaram`}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={quality.por_faixa} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="faixa" stroke="#64748b" fontSize={11} angle={-30} textAnchor="end" height={70} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="qtd" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Número de convidados" subtitle={`${quality.por_convidados.reduce((s, c) => s + c.qtd, 0)} leads informaram`}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={quality.por_convidados}
                dataKey="qtd"
                nameKey="bucket"
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={90}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                label={(entry: any) => `${entry.bucket} (${entry.pct}%)`}
                labelLine={false}
                fontSize={11}
              >
                {quality.por_convidados.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <SectionCard title="Top destinos" subtitle="Onde o lead disse que quer casar">
        <ResponsiveContainer width="100%" height={Math.max(220, quality.por_destino.length * 28)}>
          <BarChart data={quality.por_destino} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" stroke="#64748b" fontSize={12} />
            <YAxis dataKey="destino" type="category" stroke="#64748b" fontSize={11} width={150} />
            <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="qtd" fill="#0891b2" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      {/* === Conversão por segmento === */}
      <SectionCard
        title="Conversão por faixa de investimento"
        subtitle="Atenção: leads que já fecharam venda em geral entraram antes do site coletar essa faixa, então a taxa aparece baixa. Daqui pra frente fica preenchida."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase">
                <th className="py-2">Faixa</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Ganhos</th>
                <th className="py-2 text-right">Perdidos</th>
                <th className="py-2 text-right">Taxa de ganho</th>
              </tr>
            </thead>
            <tbody>
              {conversao_segmento.por_faixa.map((row) => (
                <tr key={row.faixa} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{row.faixa}</td>
                  <td className="py-2 text-right text-slate-700">{row.total.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right text-emerald-600 font-medium">{row.ganhos}</td>
                  <td className="py-2 text-right text-rose-500">{row.perdidos ?? 0}</td>
                  <td className="py-2 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${(row.taxa_ganho ?? 0) >= 5 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {row.taxa_ganho}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* === Tempo em cada fase === */}
      <SectionCard title="Tempo em cada fase" subtitle="Quanto tempo um lead típico fica em cada etapa do funil">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {service.tempo_em_fase.map((t) => (
            <div key={t.phase_name} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-medium text-slate-500">{t.phase_name}</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{t.mediana_dias}d</div>
              <div className="text-xs text-slate-500">típico (mediana de {t.amostra} leads)</div>
              <div className="mt-1 text-xs text-slate-400">média: {t.avg_dias}d</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* === Motivos de perda === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Motivos de perda — SDR" subtitle="Por que leads caíram na fase de qualificação">
          {service.motivos_perda_sdr.length === 0 ? (
            <p className="text-sm text-slate-500">Sem dados no período.</p>
          ) : (
            <ul className="space-y-2">
              {service.motivos_perda_sdr.map((m) => (
                <li key={m.motivo} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{m.motivo}</span>
                  <span className="font-medium text-slate-900 tabular-nums">{m.qtd}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Motivos de perda — Closer" subtitle="Por que leads caíram na fase de negociação">
          {service.motivos_perda_closer.length === 0 ? (
            <p className="text-sm text-slate-500">Sem dados no período.</p>
          ) : (
            <ul className="space-y-2">
              {service.motivos_perda_closer.map((m) => (
                <li key={m.motivo} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{m.motivo}</span>
                  <span className="font-medium text-slate-900 tabular-nums">{m.qtd}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="text-xs text-slate-400 text-center pt-4">
        Dados sincronizados com ActiveCampaign · pipeline_id: {data.pipeline_id?.slice(0, 8)}…
      </div>
    </div>
  )
}
