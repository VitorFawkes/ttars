import { Briefcase, DollarSign, Clock, AlertTriangle, ReceiptText } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { formatCurrency } from '@/utils/whatsappFormatters'
import type { PipelineCurrentKpis, DateRef } from '@/hooks/analytics/usePipelineCurrent'
import type { MetricMode } from './constants'

interface Props {
  kpis: PipelineCurrentKpis
  metric: MetricMode
  dateRef: DateRef
  unassignedCount: number
  isLoading: boolean
  onAllCardsDrill: () => void
}

export default function PipelineKpis({
  kpis,
  metric,
  dateRef,
  unassignedCount,
  isLoading,
  onAllCardsDrill,
}: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <KpiCard
        title="Cards Abertos"
        value={kpis.total_open}
        icon={Briefcase}
        color="text-blue-600"
        bgColor="bg-blue-50"
        isLoading={isLoading}
        onClick={onAllCardsDrill}
        clickHint="Ver todos os cards"
        subtitle={unassignedCount > 0 ? `${unassignedCount} sem responsável` : undefined}
      />
      <KpiCard
        title={metric === 'receita' ? 'Receita no Pipeline' : 'Faturamento no Pipeline'}
        value={formatCurrency(metric === 'receita' ? kpis.total_receita : kpis.total_value)}
        icon={DollarSign}
        color="text-emerald-600"
        bgColor="bg-emerald-50"
        isLoading={isLoading}
      />
      <KpiCard
        title={metric === 'receita' ? 'Receita Média' : 'Ticket Médio'}
        value={formatCurrency(metric === 'receita' ? kpis.avg_receita_ticket : kpis.avg_ticket)}
        icon={ReceiptText}
        color="text-indigo-600"
        bgColor="bg-indigo-50"
        isLoading={isLoading}
      />
      <KpiCard
        title={dateRef === 'stage' ? 'Idade Média (etapa)' : 'Idade Média (criação)'}
        value={kpis.avg_age_days}
        icon={Clock}
        color="text-amber-600"
        bgColor="bg-amber-50"
        isLoading={isLoading}
      />
      <KpiCard
        title="SLA Violado"
        value={kpis.sla_breach_count > 0 ? `${kpis.sla_breach_count}` : '0'}
        icon={AlertTriangle}
        color={kpis.sla_breach_count > 0 ? 'text-rose-600' : 'text-slate-400'}
        bgColor={kpis.sla_breach_count > 0 ? 'bg-rose-50' : 'bg-slate-50'}
        isLoading={isLoading}
      />
    </div>
  )
}
