import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Loader2, Route, Clock, Layers } from 'lucide-react'
import { parseISO, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useSdrLeadCohort } from '@/hooks/analytics/useSdrLeadCohort'
import WidgetCard from './WidgetCard'
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

function mesLabel(iso: string): string {
  try { return format(parseISO(iso), 'MMM/yy', { locale: ptBR }).replace('.', '') } catch { return iso }
}

const TEMPO_LABELS: { key: keyof import('@/hooks/analytics/useSdrLeadCohort').SdrCohortTempo; label: string; color: string }[] = [
  { key: 'mesmo_dia', label: 'Mesmo dia', color: '#94a3b8' },
  { key: 'd1_7', label: '1–7 dias', color: '#34d399' },
  { key: 'd7_30', label: '7–30 dias', color: '#10b981' },
  { key: 'd30_60', label: '30–60 dias', color: '#f59e0b' },
  { key: 'd60_90', label: '60–90 dias', color: '#fb923c' },
  { key: 'd90_mais', label: '90+ dias', color: '#f43f5e' },
]

export default function SdrEvolutionSection() {
  const { data, isLoading } = useSdrLeadCohort(6)

  const cohortData = useMemo(() => {
    return (data?.cohort ?? []).map(c => ({
      mes: mesLabel(c.cohort_mes),
      ganhos: c.ganhos,
      perdidos: c.perdidos,
      abertos: c.abertos,
      conv_pct: c.conv_pct,
      leads: c.leads,
    }))
  }, [data])

  const origemData = useMemo(() => {
    const rows = [...(data?.por_origem ?? [])].sort((a, b) => b.leads - a.leads)
    const max = Math.max(...rows.map(r => r.leads), 1)
    return { rows, max }
  }, [data])

  const tempo = data?.tempo_buckets
  const tempoMax = useMemo(() => {
    if (!tempo) return 1
    return Math.max(...TEMPO_LABELS.map(t => tempo[t.key] ?? 0), 1)
  }, [tempo])
  const tempoTotal = useMemo(() => {
    if (!tempo) return 0
    return TEMPO_LABELS.reduce((s, t) => s + (tempo[t.key] ?? 0), 0)
  }, [tempo])

  const kpis = data?.kpis

  return (
    <div className="flex flex-col gap-6">
      {/* Coorte de conversão — evolução dos leads por mês de entrada */}
      <WidgetCard
        title="Evolução dos leads por mês de entrada"
        subtitle="De cada turma de leads que entrou no mês, quantos viraram venda, quantos perdemos e quantos seguem abertos — e a taxa de conversão (linha). Últimos 6 meses."
        action={<Route className="w-4 h-4 text-slate-300" />}
      >
        {isLoading ? (
          <div className="h-72 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : cohortData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-sm text-slate-400">Sem leads no período</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-4">
              <MiniStat label="Leads (6m)" value={kpis ? kpis.total_leads.toLocaleString('pt-BR') : '0'} tone="slate" />
              <MiniStat label="Viraram venda" value={kpis ? `${kpis.total_ganhos} (${kpis.conv_pct}%)` : '0'} tone="emerald" />
              <MiniStat label="Perdidos" value={kpis ? kpis.total_perdidos.toLocaleString('pt-BR') : '0'} tone="rose" />
              <MiniStat label="Ainda abertos" value={kpis ? kpis.total_abertos.toLocaleString('pt-BR') : '0'} tone="indigo" />
              <MiniStat
                label="Tempo típico p/ fechar"
                value={kpis?.mediana_dias_ganho != null ? `${Math.round(kpis.mediana_dias_ganho)} dias` : '—'}
                tone="slate"
                hint="mediana do ciclo, ignorando fechamentos registrados no ato (ciclo 0)"
              />
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={cohortData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#6366f1' }} unit="%" domain={[0, 'auto']} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="ganhos" name="Viraram venda" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar yAxisId="left" dataKey="perdidos" name="Perdidos" stackId="a" fill="#fb7185" />
                <Bar yAxisId="left" dataKey="abertos" name="Abertos" stackId="a" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="conv_pct" name="Conversão %" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </WidgetCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversão por origem */}
        <WidgetCard
          title="Conversão por origem"
          subtitle="De cada canal de entrada, quantos leads e quanto % vira venda. A barra mostra o volume; o número verde, a conversão."
          action={<Layers className="w-4 h-4 text-slate-300" />}
        >
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : origemData.rows.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem leads no período</div>
          ) : (
            <div className="space-y-2.5">
              {origemData.rows.map(row => {
                const tone = row.conv_pct >= 15 ? 'text-emerald-700 bg-emerald-50' : row.conv_pct >= 5 ? 'text-amber-700 bg-amber-50' : 'text-slate-500 bg-slate-50'
                return (
                  <div key={row.origem} className="flex items-center gap-3">
                    <span className="w-28 text-xs font-medium text-slate-700 truncate" title={ORIGEM_LABELS[row.origem] ?? row.origem}>
                      {ORIGEM_LABELS[row.origem] ?? row.origem}
                    </span>
                    <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden relative">
                      <div className="h-full bg-indigo-200" style={{ width: `${(row.leads / origemData.max) * 100}%` }} />
                      <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-slate-600 tabular-nums">
                        {row.leads.toLocaleString('pt-BR')} leads · {row.ganhos} vendas
                      </span>
                    </div>
                    <span className={cn('w-14 text-center text-xs font-semibold tabular-nums rounded-md py-0.5', tone)}>
                      {row.conv_pct}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </WidgetCard>

        {/* Tempo até fechar */}
        <WidgetCard
          title="Em quanto tempo fecham"
          subtitle="Tempo entre a entrada do lead e o fechamento da venda. Obs: muitos são registrados no mesmo dia (importações/fechamento no ato) — por isso o 'tempo típico' acima conta só vendas com ciclo real (> 0)."
          action={<Clock className="w-4 h-4 text-slate-300" />}
        >
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : !tempo || tempoTotal === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem vendas com data de fechamento</div>
          ) : (
            <div className="space-y-2.5">
              {TEMPO_LABELS.map(t => {
                const v = tempo[t.key] ?? 0
                return (
                  <div key={t.key} className="flex items-center gap-3">
                    <span className="w-24 text-xs font-medium text-slate-700">{t.label}</span>
                    <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${(v / tempoMax) * 100}%`, backgroundColor: t.color }} />
                    </div>
                    <span className="w-20 text-right text-xs text-slate-600 tabular-nums">
                      {v.toLocaleString('pt-BR')}
                      <span className="text-slate-400"> · {tempoTotal > 0 ? Math.round((v / tempoTotal) * 100) : 0}%</span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </WidgetCard>
      </div>
    </div>
  )
}

function MiniStat({ label, value, tone, hint }: { label: string; value: string; tone: 'slate' | 'emerald' | 'rose' | 'indigo'; hint?: string }) {
  const toneMap = {
    slate: 'bg-slate-50 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  }
  return (
    <div className={cn('rounded-xl px-3 py-2 min-w-[120px]', toneMap[tone])} title={hint}>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}
