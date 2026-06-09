import { useMemo, useState } from 'react'
import { Repeat, Users, Trophy, Clock } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { useRetencaoCohort } from '@/hooks/analytics/useRetencaoCohort'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { getRankTier, rankBadgeClass, rankDotClass, rankTierLabel } from '@/utils/rankColor'
import WidgetCard from './WidgetCard'
import SimpleFilterBar from './SimpleFilterBar'
import { FILTER_CONTRACTS } from '@/hooks/analytics/filterContracts'
import { cn } from '@/lib/utils'

const COHORT_RANGE_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: 'Últimos 3 meses' },
  { value: 6, label: 'Últimos 6 meses' },
  { value: 12, label: 'Últimos 12 meses' },
  { value: 24, label: 'Últimos 24 meses' },
  { value: 36, label: 'Últimos 36 meses' },
]

function formatMes(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
}

export default function RetentionView() {
  const [monthsBack, setMonthsBack] = useState(12)
  const { data, isLoading } = useRetencaoCohort(monthsBack)

  const kpis = data?.kpis
  const cohorts = data?.cohort_table ?? []
  const buckets = data?.tempo_para_voltar ?? []
  const tops = data?.top_repeats ?? []

  const taxaGeralRetorno =
    kpis && kpis.clientes_novos_periodo > 0
      ? Math.round((kpis.clientes_que_voltaram / kpis.clientes_novos_periodo) * 100)
      : 0

  const maxBucket = Math.max(...buckets.map(b => b.qtd), 1)

  // Sample para comparar cohorts entre si — top 25% verde, bottom 25% vermelho
  const cohortRetornoSample = useMemo(() => cohorts.map(c => c.taxa_retorno), [cohorts])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Retenção</h1>
          <p className="text-sm text-slate-500 mt-1">
            Clientes que voltaram — taxa de retorno, tempo até voltar e top recorrentes.
            Cliente que voltou = mesma pessoa com 2 ou mais viagens ganhas.
          </p>
        </div>
        <select
          value={monthsBack}
          onChange={e => setMonthsBack(Number(e.target.value))}
          className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-700 focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
        >
          {COHORT_RANGE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </header>

      <SimpleFilterBar contract={FILTER_CONTRACTS.retencao} myButtonLabel="Meus clientes" />

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Clientes novos no período"
          value={kpis?.clientes_novos_periodo ?? 0}
          icon={Users}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={isLoading}
        />
        <KpiCard
          title="Voltaram pra comprar de novo"
          value={kpis ? `${kpis.clientes_que_voltaram} (${taxaGeralRetorno}%)` : '0'}
          icon={Repeat}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={isLoading}
          subtitle="Pelo menos 2 viagens ganhas"
        />
        <KpiCard
          title="Ticket médio novo"
          value={kpis ? formatCurrency(kpis.ticket_medio_novo) : 'R$ 0'}
          icon={Trophy}
          color="text-slate-600"
          bgColor="bg-slate-50"
          isLoading={isLoading}
          subtitle="Primeira compra"
        />
        <KpiCard
          title="Ticket médio repeat"
          value={kpis ? formatCurrency(kpis.ticket_medio_repeat) : 'R$ 0'}
          icon={Trophy}
          color="text-emerald-700"
          bgColor="bg-emerald-50"
          isLoading={isLoading}
          subtitle="Compras a partir da 2ª"
        />
      </div>

      {/* Cohort table */}
      <WidgetCard
        title="Cohort por mês de entrada"
        subtitle="Cada linha é um mês de primeira viagem. % do cohort que voltou pelo menos uma vez"
      >
        {isLoading ? (
          <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
        ) : cohorts.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem cohorts no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Cohort (1ª viagem em)</th>
                  <th className="text-right py-2 font-medium">Tamanho</th>
                  <th className="text-right py-2 font-medium">Voltaram</th>
                  <th className="text-right py-2 font-medium">Taxa de retorno</th>
                  <th className="text-left py-2 font-medium w-1/3">Visual</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map(row => {
                  const tier = getRankTier(row.taxa_retorno, cohortRetornoSample, 'higher_is_better')
                  return (
                    <tr key={row.cohort_mes} className="border-b border-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium">{formatMes(row.cohort_mes)}</td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.tamanho}</td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.retornaram}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold',
                            rankBadgeClass(tier),
                          )}
                          title={rankTierLabel(tier)}
                        >
                          {row.taxa_retorno}%
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden max-w-[200px]">
                          <div
                            className={cn('h-full', rankDotClass(tier))}
                            style={{ width: `${Math.min(row.taxa_retorno * 2, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Tempo pra voltar + Top recorrentes lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard
          title="Tempo até voltar"
          subtitle="Quanto tempo o cliente leva pra comprar a 2ª viagem"
          action={<Clock className="w-4 h-4 text-slate-300" />}
        >
          {isLoading ? (
            <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
          ) : buckets.length === 0 ? (
            <div className="text-sm text-slate-400 py-3">Sem dados de retorno</div>
          ) : (
            <div className="space-y-2">
              {buckets.map(b => (
                <div key={b.bucket} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-700 w-20">{b.bucket}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-indigo-500"
                      style={{ width: `${(b.qtd / maxBucket) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-600 tabular-nums w-10 text-right">{b.qtd}</span>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>

        <WidgetCard
          title="Top 20 recorrentes"
          subtitle="Clientes com mais viagens — quem mais volta"
        >
          {isLoading ? (
            <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
          ) : tops.length === 0 ? (
            <div className="text-sm text-slate-400 py-3">Nenhum cliente com 2+ viagens</div>
          ) : (
            <div className="overflow-y-auto max-h-[280px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                    <th className="text-left py-2 font-medium">Cliente</th>
                    <th className="text-right py-2 font-medium">Viagens</th>
                    <th className="text-right py-2 font-medium">LTV</th>
                  </tr>
                </thead>
                <tbody>
                  {tops.map(t => (
                    <tr key={t.cliente_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 text-slate-900 font-medium max-w-[200px] truncate">
                        {t.cliente_nome ?? '—'}
                      </td>
                      <td className="py-2 text-right text-slate-700 tabular-nums font-semibold">
                        {t.total_viagens}
                      </td>
                      <td className="py-2 text-right text-slate-700 tabular-nums">
                        {formatCurrency(t.lifetime_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WidgetCard>
      </div>
    </div>
  )
}
