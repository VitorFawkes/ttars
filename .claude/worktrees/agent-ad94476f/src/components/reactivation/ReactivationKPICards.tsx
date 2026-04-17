import { Users, AlertTriangle, Clock, DollarSign } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'

interface Props {
    kpis: {
        totalPriority: number
        totalOverdue: number
        totalSoon: number
        estimatedRevenue: number
    }
    loading: boolean
    onFilterUrgency: (urgency: 'all' | 'overdue' | 'soon' | 'planned') => void
}

function formatCurrency(value: number): string {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`
    return `R$ ${value.toFixed(0)}`
}

export default function ReactivationKPICards({ kpis, loading, onFilterUrgency }: Props) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
                title="Prioritários"
                value={kpis.totalPriority}
                icon={Users}
                color="text-indigo-600"
                bgColor="bg-indigo-50"
                subtitle="Score ≥ 70"
                isLoading={loading}
                onClick={() => onFilterUrgency('all')}
                clickHint="Ver todos"
            />
            <KpiCard
                title="Atrasados"
                value={kpis.totalOverdue}
                icon={AlertTriangle}
                color="text-red-600"
                bgColor="bg-red-50"
                subtitle="Janela já passou"
                isLoading={loading}
                onClick={() => onFilterUrgency('overdue')}
                clickHint="Filtrar atrasados"
            />
            <KpiCard
                title="Agir agora"
                value={kpis.totalSoon}
                icon={Clock}
                color="text-amber-600"
                bgColor="bg-amber-50"
                subtitle="Próximos 30 dias"
                isLoading={loading}
                onClick={() => onFilterUrgency('soon')}
                clickHint="Filtrar próximos"
            />
            <KpiCard
                title="Receita potencial"
                value={formatCurrency(kpis.estimatedRevenue)}
                icon={DollarSign}
                color="text-emerald-600"
                bgColor="bg-emerald-50"
                subtitle="Score ≥ 50"
                isLoading={loading}
            />
        </div>
    )
}
