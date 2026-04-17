import { useMemo } from 'react'
import { TrendingUp, Users, DollarSign, AlertCircle, Clock } from 'lucide-react'
import { useReceitaPermission } from '../../hooks/useReceitaPermission'
import type { LeadCard } from '../../hooks/useLeadsQuery'

interface LeadsStatsBarProps {
    leads: LeadCard[]
}

interface StatCard {
    label: string
    value: string | number
    icon: React.ReactNode
    color: string
}

export default function LeadsStatsBar({ leads }: LeadsStatsBarProps) {
    const receitaPerm = useReceitaPermission()
    const stats = useMemo(() => {
        // Calculate stats from current page data
        const valorTotal = leads.reduce((sum, lead) => sum + (lead.valor_display || lead.valor_estimado || 0), 0)
        const receitaTotal = leads.reduce((sum, lead) => sum + (lead.receita || 0), 0)

        const statusCounts = leads.reduce((acc, lead) => {
            const status = lead.status_comercial || 'aberto'
            acc[status] = (acc[status] || 0) + 1
            return acc
        }, {} as Record<string, number>)

        const tarefasAtrasadas = leads.reduce((sum, lead) => {
            const count = lead.tarefas_atrasadas as number | null
            return sum + (count || 0)
        }, 0)

        const mediaDiasSemContato = leads.length > 0
            ? Math.round(leads.reduce((sum, lead) => {
                const dias = lead.tempo_sem_contato as number | null
                return sum + (dias || 0)
            }, 0) / leads.length)
            : 0

        return {
            valorTotal,
            receitaTotal,
            abertos: statusCounts['aberto'] || 0,
            ganhos: statusCounts['ganho'] || 0,
            perdidos: statusCounts['perdido'] || 0,
            tarefasAtrasadas,
            mediaDiasSemContato
        }
    }, [leads])

    const cards: StatCard[] = [
        {
            label: 'Valor Total',
            value: new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                notation: 'compact',
                maximumFractionDigits: 1
            }).format(stats.valorTotal),
            icon: <DollarSign className="h-4 w-4" />,
            color: 'text-emerald-600 bg-emerald-50'
        },
        ...(receitaPerm.canView && stats.receitaTotal > 0 ? [{
            label: 'Receita',
            value: new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                notation: 'compact' as const,
                maximumFractionDigits: 1
            }).format(stats.receitaTotal),
            icon: <TrendingUp className="h-4 w-4" />,
            color: 'text-amber-600 bg-amber-50'
        }] : []),
        {
            label: 'Abertos',
            value: stats.abertos,
            icon: <Users className="h-4 w-4" />,
            color: 'text-blue-600 bg-blue-50'
        },
        {
            label: 'Ganhos',
            value: stats.ganhos,
            icon: <TrendingUp className="h-4 w-4" />,
            color: 'text-green-600 bg-green-50'
        },
        {
            label: 'Perdidos',
            value: stats.perdidos,
            icon: <TrendingUp className="h-4 w-4 rotate-180" />,
            color: 'text-red-600 bg-red-50'
        },
        {
            label: 'Tarefas Atrasadas',
            value: stats.tarefasAtrasadas,
            icon: <AlertCircle className="h-4 w-4" />,
            color: stats.tarefasAtrasadas > 0 ? 'text-orange-600 bg-orange-50' : 'text-gray-600 bg-gray-50'
        },
        {
            label: 'Média Dias s/ Contato',
            value: `${stats.mediaDiasSemContato}d`,
            icon: <Clock className="h-4 w-4" />,
            color: stats.mediaDiasSemContato > 7 ? 'text-amber-600 bg-amber-50' : 'text-gray-600 bg-gray-50'
        }
    ]

    return (
        <div className="flex items-center gap-4 px-6 py-3 bg-white border-b border-gray-200 overflow-x-auto">
            {cards.map((card, index) => (
                <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 min-w-fit"
                >
                    <div className={`p-1.5 rounded-md ${card.color}`}>
                        {card.icon}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-gray-500">{card.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{card.value}</span>
                    </div>
                </div>
            ))}
        </div>
    )
}
